use std::collections::{BTreeSet, HashMap};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use serde::Deserialize;
use spellbook::Dictionary;
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

use crate::blocking::on_blocking_pool;
use crate::error::{Error, Result};
use crate::files::write_atomically;

/// A language Ernest can spell. Its code names the Hunspell files in
/// `dictionaries/` (`fr.aff`, `fr.dic`, with `fr.LICENSE.txt`), which ship
/// as bundle resources rather than inside the binary: every platform spells
/// alike, and each dictionary keeps its own licence.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash, Deserialize)]
pub enum Language {
    #[serde(rename = "en-US")]
    EnglishUnitedStates,
    #[serde(rename = "fr")]
    French,
    #[serde(rename = "it")]
    Italian,
    #[serde(rename = "es")]
    Spanish,
}

impl Language {
    fn code(self) -> &'static str {
        match self {
            Self::EnglishUnitedStates => "en-US",
            Self::French => "fr",
            Self::Italian => "it",
            Self::Spanish => "es",
        }
    }
}

/// How many suggestions `z=` lists.
const SUGGESTION_LIMIT: usize = 9;

/// Longer "words" are not judged, suggested for or learnt: Hunspell's own
/// limit, and it bounds the work one call can ask for.
const MAXIMUM_WORD_LENGTH: usize = 100;

/// Far more than a rendered viewport holds.
const MAXIMUM_WORDS_PER_CHECK: usize = 10_000;

/// The dictionaries of the languages asked for so far, plus the writer's own
/// words, kept one per line in `dictionary.txt` next to the settings and
/// shared by every language.
pub struct Speller {
    dictionary_directory: PathBuf,
    /// Parsed on first use: a writer who never spells in Italian never pays
    /// for the Italian dictionary.
    dictionaries: HashMap<Language, Dictionary>,
    personal: Vec<String>,
    personal_path: PathBuf,
}

impl Speller {
    pub fn load(dictionary_directory: PathBuf, personal_path: PathBuf) -> Result<Self> {
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
        Ok(Self {
            dictionary_directory,
            dictionaries: HashMap::new(),
            personal,
            personal_path,
        })
    }

    /// Parses the dictionaries of `languages` not loaded yet, teaching each
    /// the personal words.
    fn prepare(&mut self, languages: &BTreeSet<Language>) -> Result<()> {
        if languages.is_empty() {
            return Err(Error::Dictionary("no spelling language chosen".into()));
        }
        for &language in languages {
            if self.dictionaries.contains_key(&language) {
                continue;
            }
            let read = |extension: &str| {
                let path = self
                    .dictionary_directory
                    .join(format!("{}.{extension}", language.code()));
                fs::read_to_string(&path).map_err(Error::io(path))
            };
            let mut dictionary = Dictionary::new(&read("aff")?, &read("dic")?)
                .map_err(|error| Error::Dictionary(error.to_string()))?;
            for word in &self.personal {
                add_to(&mut dictionary, word)?;
            }
            self.dictionaries.insert(language, dictionary);
        }
        Ok(())
    }

    fn dictionaries<'speller>(
        &'speller self,
        languages: &'speller BTreeSet<Language>,
    ) -> impl Iterator<Item = &'speller Dictionary> {
        languages
            .iter()
            .filter_map(|language| self.dictionaries.get(language))
    }

    /// Whether each word is spelled correctly in at least one of `languages`,
    /// as Vim's `spelllang` with several languages.
    pub fn check(&mut self, words: &[String], languages: &BTreeSet<Language>) -> Result<Vec<bool>> {
        if words.len() > MAXIMUM_WORDS_PER_CHECK {
            return Err(Error::Dictionary(format!(
                "at most {MAXIMUM_WORDS_PER_CHECK} words per check"
            )));
        }
        self.prepare(languages)?;
        Ok(words
            .iter()
            .map(|word| {
                !is_judged(word)
                    || self
                        .dictionaries(languages)
                        .any(|dictionary| dictionary.check(word))
            })
            .collect())
    }

    /// Corrections from every language, best of each first: the first
    /// suggestion of each language, then the second of each, and so on.
    pub fn suggest(&mut self, word: &str, languages: &BTreeSet<Language>) -> Result<Vec<String>> {
        if !is_judged(word) {
            return Ok(Vec::new());
        }
        self.prepare(languages)?;
        let lists: Vec<Vec<String>> = self
            .dictionaries(languages)
            .map(|dictionary| {
                let mut suggestions = Vec::new();
                dictionary.suggest(word, &mut suggestions);
                suggestions
            })
            .collect();
        let longest = lists.iter().map(Vec::len).max().unwrap_or(0);
        let mut merged: Vec<String> = Vec::new();
        for rank in 0..longest {
            for suggestion in lists.iter().filter_map(|list| list.get(rank)) {
                if !merged.contains(suggestion) {
                    merged.push(suggestion.clone());
                }
            }
        }
        merged.truncate(SUGGESTION_LIMIT);
        Ok(merged)
    }

    /// Appends `word` to the personal list, then teaches every loaded
    /// dictionary; dictionaries loaded later learn it from the list. The file
    /// is written first, so a failed write leaves nothing learnt that a
    /// restart would forget.
    pub fn add(&mut self, word: &str) -> Result<()> {
        let word = word.trim();
        if !is_personal_word(word) || self.personal.iter().any(|known| known == word) {
            return Ok(());
        }
        if let Some(directory) = self.personal_path.parent() {
            fs::create_dir_all(directory).map_err(Error::io(directory))?;
        }
        let mut text = self.personal.join("\n");
        if !text.is_empty() {
            text.push('\n');
        }
        text.push_str(word);
        text.push('\n');
        write_atomically(&self.personal_path, text.as_bytes())?;
        self.personal.push(word.to_owned());
        for dictionary in self.dictionaries.values_mut() {
            add_to(dictionary, word)?;
        }
        Ok(())
    }
}

/// Compares bytes first: a character takes at most four, so a longer
/// string is refused without walking it, however large it is.
fn is_judged(word: &str) -> bool {
    word.len() <= MAXIMUM_WORD_LENGTH * 4 && word.chars().count() <= MAXIMUM_WORD_LENGTH
}

/// A personal entry is one word. `/` would start Hunspell affix flags.
fn is_personal_word(word: &str) -> bool {
    !word.is_empty() && is_judged(word) && !word.contains(['/', ' ', '\t'])
}

fn add_to(dictionary: &mut Dictionary, word: &str) -> Result<()> {
    dictionary
        .add(word)
        .map_err(|error| Error::Dictionary(error.to_string()))
}

/// Created on first use, so a writer with spell checking off never reads the
/// personal word list or a dictionary.
#[derive(Default)]
pub struct SpellingState(Mutex<Option<Speller>>);

/// Runs `action` on the speller, creating it first if needed. Parsing a
/// dictionary or computing suggestions takes tens of milliseconds per
/// language, so it runs on the blocking pool rather than an async worker.
async fn with_speller<T: Send + 'static>(
    app: AppHandle,
    action: impl FnOnce(&mut Speller) -> Result<T> + Send + 'static,
) -> Result<T> {
    on_blocking_pool(move || {
        let state = app.state::<SpellingState>();
        let mut slot = state
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if slot.is_none() {
            let dictionaries = app
                .path()
                .resolve("dictionaries", BaseDirectory::Resource)
                .map_err(|error| Error::Dictionary(error.to_string()))?;
            let personal = app.path().app_config_dir()?.join("dictionary.txt");
            *slot = Some(Speller::load(dictionaries, personal)?);
        }
        action(slot.as_mut().expect("loaded above"))
    })
    .await?
}

/// Whether each word is spelled correctly in one of `languages`, in order.
#[tauri::command]
pub async fn check_words(
    app: AppHandle,
    words: Vec<String>,
    languages: BTreeSet<Language>,
) -> Result<Vec<bool>> {
    with_speller(app, move |speller| speller.check(&words, &languages)).await
}

#[tauri::command]
pub async fn spelling_suggestions(
    app: AppHandle,
    word: String,
    languages: BTreeSet<Language>,
) -> Result<Vec<String>> {
    with_speller(app, move |speller| speller.suggest(&word, &languages)).await
}

#[tauri::command]
pub async fn add_to_dictionary(app: AppHandle, word: String) -> Result<()> {
    with_speller(app, move |speller| speller.add(&word)).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn speller_in(directory: &tempfile::TempDir) -> Speller {
        let dictionaries = Path::new(env!("CARGO_MANIFEST_DIR")).join("dictionaries");
        Speller::load(dictionaries, directory.path().join("dictionary.txt")).unwrap()
    }

    fn languages(list: &[Language]) -> BTreeSet<Language> {
        list.iter().copied().collect()
    }

    fn checks(speller: &mut Speller, list: &[Language], words: &[&str]) -> Vec<bool> {
        let words: Vec<String> = words.iter().map(|word| word.to_string()).collect();
        speller.check(&words, &languages(list)).unwrap()
    }

    const ENGLISH: &[Language] = &[Language::EnglishUnitedStates];

    #[test]
    fn checks_words_against_the_bundled_dictionary() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        let answers = checks(
            &mut speller,
            ENGLISH,
            &["paragraph", "doesn't", "paragrpah"],
        );
        assert_eq!(answers, [true, true, false]);
    }

    #[test]
    fn checks_french_italian_and_spanish_with_elision() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        let french = checks(
            &mut speller,
            &[Language::French],
            &["l'école", "jusqu'à", "écrivian"],
        );
        assert_eq!(french, [true, true, false]);
        let italian = checks(
            &mut speller,
            &[Language::Italian],
            &["dell'anno", "città", "scritore"],
        );
        assert_eq!(italian, [true, true, false]);
        let spanish = checks(
            &mut speller,
            &[Language::Spanish],
            &["niño", "cantábamos", "escritro"],
        );
        assert_eq!(spanish, [true, true, false]);
    }

    #[test]
    fn accepts_a_word_known_to_any_chosen_language() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        let both = [Language::EnglishUnitedStates, Language::French];
        assert_eq!(checks(&mut speller, ENGLISH, &["aujourd'hui"]), [false]);
        assert_eq!(
            checks(&mut speller, &both, &["aujourd'hui", "paragraph"]),
            [true, true]
        );
    }

    #[test]
    fn refuses_an_empty_language_list() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        assert!(speller.check(&["word".into()], &BTreeSet::new()).is_err());
    }

    #[test]
    fn suggests_corrections() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        let suggestions = speller.suggest("paragrpah", &languages(ENGLISH)).unwrap();
        assert!(suggestions.iter().any(|word| word == "paragraph"));
        assert!(suggestions.len() <= SUGGESTION_LIMIT);
    }

    #[test]
    fn merges_suggestions_across_languages() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        let both = languages(&[Language::EnglishUnitedStates, Language::Italian]);
        let suggestions = speller.suggest("scritore", &both).unwrap();
        assert!(suggestions.iter().any(|word| word == "scrittore"));
        assert!(suggestions.len() <= SUGGESTION_LIMIT);
        let unique: BTreeSet<&String> = suggestions.iter().collect();
        assert_eq!(unique.len(), suggestions.len());
    }

    #[test]
    fn remembers_personal_words_across_loads_and_languages() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        assert_eq!(checks(&mut speller, ENGLISH, &["Tauri"]), [false]);
        speller.add("Tauri").unwrap();
        speller.add("Tauri").unwrap();
        assert_eq!(checks(&mut speller, ENGLISH, &["Tauri"]), [true]);
        // A dictionary loaded after the word was added learns it too.
        assert_eq!(
            checks(&mut speller, &[Language::Spanish], &["Tauri"]),
            [true]
        );

        let text = fs::read_to_string(directory.path().join("dictionary.txt")).unwrap();
        assert_eq!(text, "Tauri\n");
        assert_eq!(
            checks(&mut speller_in(&directory), &[Language::French], &["Tauri"]),
            [true]
        );
    }

    #[test]
    fn refuses_entries_that_are_not_one_word() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        speller.add("two words").unwrap();
        speller.add("flagged/G").unwrap();
        speller.add(&"a".repeat(MAXIMUM_WORD_LENGTH + 1)).unwrap();
        assert!(!directory.path().join("dictionary.txt").exists());
    }

    #[test]
    fn judges_length_in_characters_and_refuses_huge_strings_by_bytes() {
        assert!(is_judged(&"é".repeat(MAXIMUM_WORD_LENGTH)));
        assert!(!is_judged(&"é".repeat(MAXIMUM_WORD_LENGTH + 1)));
        assert!(!is_judged(&"a".repeat(1 << 20)));
    }

    #[test]
    fn leaves_overlong_words_and_batches_alone() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        let long = "q".repeat(MAXIMUM_WORD_LENGTH + 1);
        assert_eq!(checks(&mut speller, ENGLISH, &[&long]), [true]);
        assert!(
            speller
                .suggest(&long, &languages(ENGLISH))
                .unwrap()
                .is_empty()
        );
        let batch = vec![String::from("word"); MAXIMUM_WORDS_PER_CHECK + 1];
        assert!(speller.check(&batch, &languages(ENGLISH)).is_err());
    }

    #[test]
    fn keeps_every_personal_word_in_the_file() {
        let directory = tempfile::tempdir().unwrap();
        let mut speller = speller_in(&directory);
        speller.add("Tauri").unwrap();
        speller.add("Ernest").unwrap();
        let text = fs::read_to_string(directory.path().join("dictionary.txt")).unwrap();
        assert_eq!(text, "Tauri\nErnest\n");
    }
}
