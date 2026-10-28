# Run inside the dev shell (`direnv allow` once, or `nix develop`).

# Launch the app in dev with hot reload; extra arguments open a file (`just run notes.md`)
run *arguments:
	pnpm tauri dev {{ if arguments == "" { "" } else { "-- -- " + arguments } }}

# Build a release bundle into src-tauri/target/release/bundle/
release:
	pnpm tauri build

# Every check CI should run: types, lints, formatting, tests
check: check-frontend check-backend

check-frontend:
	pnpm check
	pnpm format:check
	pnpm test

check-backend:
	cd src-tauri && cargo fmt --check
	cd src-tauri && cargo clippy --all-targets -- -D warnings
	cd src-tauri && cargo test

# Type-check the per-OS code for every shipped target without a linker
check-targets:
	#!/usr/bin/env bash
	set -euo pipefail
	cd src-tauri
	# The clipboard plugin's macOS backend compiles an Objective-C file in a
	# build script, which needs Apple's SDK. A type check never links, so a
	# stand-in compiler that writes empty objects lets it run off a Mac
	# (without sccache, which refuses to wrap a compiler it cannot identify).
	stub="$(mktemp -d)"
	trap 'rm -rf "$stub"' EXIT
	# It answers cc-rs's compiler probes like clang (`-E` names it, `-?` is
	# refused), so it is given `-o` rather than MSVC's `-Fo`.
	printf '#!/bin/sh\ncase " $*" in *" -E "*) echo clang; exit;; *" -?"*) exit 1;; esac\nwhile [ $# -gt 0 ]; do [ "$1" = -o ] && : > "$2"; shift; done\n' > "$stub/cc"
	chmod +x "$stub/cc"
	export CC_x86_64_apple_darwin="$stub/cc" AR_x86_64_apple_darwin=ar
	for target in x86_64-apple-darwin x86_64-pc-windows-msvc x86_64-unknown-linux-gnu; do
		echo "── $target"
		if [ "$target" = x86_64-apple-darwin ]; then
			env -u RUSTC_WRAPPER cargo check --target "$target"
		else
			cargo check --target "$target"
		fi
	done

format:
	pnpm format
	cd src-tauri && cargo fmt

# Regenerate every platform icon from app-icon.svg
icons:
	pnpm tauri icon app-icon.svg -o src-tauri/icons
	rm -rf src-tauri/icons/android src-tauri/icons/ios
