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
	for target in x86_64-apple-darwin x86_64-pc-windows-msvc x86_64-unknown-linux-gnu; do
		echo "── $target"
		cargo check --target "$target"
	done

format:
	pnpm format
	cd src-tauri && cargo fmt

# Regenerate every platform icon from app-icon.svg
icons:
	pnpm tauri icon app-icon.svg -o src-tauri/icons
	rm -rf src-tauri/icons/android src-tauri/icons/ios
