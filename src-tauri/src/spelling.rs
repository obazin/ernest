use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use spellbook::Dictionary;
use tauri::{AppHandle, Manager, State};

use crate::documents::write_atomically;
use crate::error::{Error, Result};

/// The bundled en_US Hunspell dictionary (SCOWL, see `en_US.LICENSE.txt`).
/// Bundled rather than read from the system so every platform spells alike;
/// macOS and Windows have no Hunspell dictionaries to read.
const AFFIXES: &str = include_str!("../dictionaries/en_US.aff");
const WORDS: &str = include_str!("../dictionaries/en_US.dic");

/// How many suggestions `z=` lists.
const SUGGESTION_LIMIT: usize = 9;

/// The dictionary plus the writer's own words, kept one per line in
/// `dictionary.txt` next to the settings.
pub struct Speller {
    dictionary: Dictionary,
    personal: Vec<String>,
    personal_path: PathBuf,
}

impl Speller {
    pub fn load(personal_path: PathBuf) -> Result<Self> {
        let mut dictionary = Dictionary::new(AFFIXES, WORDS)
            .map_err(|error| Error::Dictionary(error.to_string()))?;
        let personal = match fs::read_to_string(&personal_path) {
            Ok(text) => text
                .lines()
                .map(str::trim)
                .filter(|word| is_personal_word(word))
                .map(String::from)
                .collect(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Vec::new(),
            Err(error) => return Err(Error::io(&personal_path)(error)),
        };
        for word in &personal {
            add_to(&mut dictionary, word)?;
        }
        Ok(Self {
            dictionary,
            personal,
            personal_path,
        })
    }

    pub fn check(&self, word: &str) -> bool {
        self.dictionary.check(word)
    }

    pub fn suggest(&self, word: &str) -> Vec<String> {
        let mut suggestions = Vec::new();
        self.dictionary.suggest(word, &mut suggestions);
        suggestions.truncate(SUGGESTION_LIMIT);
        suggestions
    }

    /// Teaches the dictionary `word` and appends it to the personal list.
    pub fn add(&mut self, word: &str) -> Result<()> {
        let word = word.trim();
        if !is_personal_word(word) || self.personal.iter().any(|known| known == word) {
            return Ok(());
        }
        add_to(&mut self.dictionary, word)?;
        self.personal.push(word.to_owned());
        if let Some(directory) = self.personal_path.parent() {
            fs::create_dir_all(directory).map_err(Error::io(directory))?;
        }
        let mut text = self.personal.join("\n");
        text.push('\n');
        write_atomically(&self.personal_path, text.as_bytes())
    }
}

/// A personal entry is one word. `/` would start Hunspell affix flags.
fn is_personal_word(word: &str) -> bool {
    !word.is_empty() && !word.contains(['/', ' ', '\t'])
}

fn add_to(dictionary: &mut Dictionary, word: &str) -> Result<()> {
    dictionary
        .add(word)
        .map_err(|error| Error::Dictionary(error.to_string()))
}

/// Loaded on first use: parsing the dictionary takes a moment, and a writer
/// with spell checking off never pays for it.
#[derive(Default)]
pub struct SpellingState(Mutex<Option<Speller>>);

fn with_speller<T>(
    app: &AppHandle,
    state: &SpellingState,
    action: impl FnOnce(&mut Speller) -> Result<T>,
) -> Result<T> {
    let mut slot = state
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    if slot.is_none() {
        let path = app.path().app_config_dir()?.join("dictionary.txt");
        *slot = Some(Speller::load(path)?);
    }
    action(slot.as_mut().expect("loaded above"))
}

/// Whether each word is spelled correctly, in order.
#[tauri::command]
pub async fn check_words(
    app: AppHandle,
    state: State<'_, SpellingState>,
    words: Vec<String>,
) -> Result<Vec<bool>> {
    with_speller(&app, &state, |speller| {
        Ok(words.iter().map(|word| speller.check(word)).collect())
    })
}

#[tauri::command]
pub async fn spelling_suggestions(
    app: AppHandle,
    state: State<'_, SpellingState>,
    word: String,
) -> Result<Vec<String>> {
    with_speller(&app, &state, |speller| Ok(speller.suggest(&word)))
}

#[tauri::command]
pub async fn add_to_dictionary(
    app: AppHandle,
    state: State<'_, SpellingState>,
    word: String,
) -> Result<()> {
    with_speller(&app, &state, |speller| speller.add(&word))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn speller_in(directory: &tempfile::TempDir) -> Speller {
        Speller::load(directory.path().join("dictionary.txt")).unwrap()
    }

    #[test]
    fn checks_words_against_the_bundled_dictionary() {
        let directory = tempfile::tempdir().unwrap();
        let speller = speller_in(&directory);
        assert!(speller.check("paragraph"));
        assert!(speller.check("doesn't"));
        assert!(!speller.check("paragrpah"));
    }

    #[test]
    fn suggests_corrections() {
        let directory = tempfile::tempdir().unwrap();
        let suggestions = speller_in(&directory).suggest("paragrpah");
        assert!(suggestions.iter().any(|word| word == "paragraph"));
        assert!(suggestions.len() <= SUGGESTION_LIMIT);
    }

    #[test]
    fn remembers_personal_words_across_loads() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        assert!(!speller.check("Tauri"));
        speller.add("Tauri").unwrap();
        speller.add("Tauri").unwrap();
        assert!(speller.check("Tauri"));

        let text = fs::read_to_string(directory.path().join("dictionary.txt")).unwrap();
        assert_eq!(text, "Tauri\n");
        assert!(speller_in(&directory).check("Tauri"));
    }

    #[test]
    fn refuses_entries_that_are_not_one_word() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        speller.add("two words").unwrap();
        speller.add("flagged/G").unwrap();
        assert!(!directory.path().join("dictionary.txt").exists());
    }
}
