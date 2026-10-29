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
	# Some build scripts call another platform's native tools: the clipboard
	# plugin compiles Objective-C against Apple's SDK, Tauri compiles the
	# Windows resource script (icon, manifest), and the Linux webview and D-Bus
	# crates look their system libraries up with pkg-config. A type check never
	# links, so stand-ins that answer the probes and write empty outputs let
	# every target check from any host, with nothing installed for it.
	stub="$(mktemp -d)"
	trap 'rm -rf "$stub"' EXIT
	# C compiler. It answers cc-rs's probes like clang (`-E` prints its
	# `"clang"` pragma message, `-?` is refused), so it is given `-o` rather
	# than MSVC's `-Fo`. The `-E` answer also serves as the preprocessed
	# resource script, which the stand-in resource compiler never reads.
	printf '#!/bin/sh\ncase " $*" in *" -E "*) echo \047"clang"\047; exit;; *" -?"*) exit 1;; esac\nwhile [ $# -gt 0 ]; do [ "$1" = -o ] && : > "$2"; shift; done\n' > "$stub/cc"
	# Resource compiler, in place of llvm-rc: embed-resource's `/?` probe looks
	# for its banner, and the compiled resource goes to the file after `/fo`.
	printf '#!/bin/sh\ncase " $*" in *" /?"*) echo "LLVM Resource Converter"; echo "  /no-preprocess"; exit;; esac\nwhile [ $# -gt 0 ]; do [ "$1" = /fo ] && : > "$2"; shift; done\n' > "$stub/rc"
	# pkg-config: every package exists, at a version above any minimum, with
	# no compiler or linker flags.
	printf '#!/bin/sh\ncase " $*" in *" --modversion "*) echo 999.0;; esac\n' > "$stub/pkg-config"
	chmod +x "$stub"/*
	export CC_x86_64_apple_darwin="$stub/cc" AR_x86_64_apple_darwin=ar
	export CC_x86_64_pc_windows_msvc="$stub/cc" RC_x86_64_pc_windows_msvc="$stub/rc"
	export PKG_CONFIG_x86_64_unknown_linux_gnu="$stub/pkg-config" PKG_CONFIG_ALLOW_CROSS_x86_64_unknown_linux_gnu=1
	for target in x86_64-apple-darwin x86_64-pc-windows-msvc x86_64-unknown-linux-gnu; do
		echo "── $target"
		# Without sccache, which refuses to wrap a compiler it cannot identify.
		env -u RUSTC_WRAPPER cargo check --target "$target"
	done

format:
	pnpm format
	cd src-tauri && cargo fmt

# Regenerate every platform icon from app-icon.svg
icons:
	pnpm tauri icon app-icon.svg -o src-tauri/icons
	rm -rf src-tauri/icons/android src-tauri/icons/ios
