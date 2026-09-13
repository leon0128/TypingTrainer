// Command go-reference regenerates the golden data that pins block-compiler's Go scanner to the
// official go/scanner, after checking that every Go fixture is byte-for-byte gofmt output.
//
// Run it with `pnpm --filter @typing-trainer/block-compiler go:golden`. CI does not need Go: it only
// reads the committed golden file.
package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"go/scanner"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
)

type goldenToken struct {
	Text  string `json:"text"`
	Start int    `json:"start"`
	End   int    `json:"end"`
}

type goldenFixture struct {
	Name   string        `json:"name"`
	SHA256 string        `json:"sha256"`
	Tokens []goldenToken `json:"tokens"`
}

type goldenPair struct {
	Prev   string   `json:"prev"`
	Next   string   `json:"next"`
	Tokens []string `json:"tokens"`
	Errors int      `json:"errors"`
}

type golden struct {
	GeneratedBy string          `json:"generatedBy"`
	Fixtures    []goldenFixture `json:"fixtures"`
	Pairs       []goldenPair    `json:"pairs"`
}

// Token pairs checked in addition to every in-line separator found in the fixtures, chosen for
// Go-specific fusion and scanner errors.
var extraPairs = [][2]string{
	{"-", "-"}, {"+", "+"}, {"<", "-"}, {"&", "^"}, {"&^", "="}, {":", "="}, {"=", "="},
	{"!", "="}, {"<", "<"}, {">", ">"}, {">", "="}, {"<<", "="}, {"&", "&"}, {"|", "|"},
	{".", "."}, {"...", "."}, {"1", "."}, {"1", ".5"}, {".", "5"}, {"0", "x"}, {"0x1", "p"},
	{"1", "e"}, {"1", "i"}, {"1", "in"}, {"1", "_000"}, {"0b1", "2"}, {"08", "9"}, {"1", "2"},
	{"x", "1"}, {"go", "func"}, {"return", "x"}, {"a", "<<"}, {")", "{"}, {"}", "else"},
	{"'a'", "b"}, {"\"s\"", "x"}, {"`raw`", "x"}, {"x", ":="}, {"a", "&^"}, {"&^", "b"},
	{"i", "++"}, {"b", "--"}, {"<-", "ch"}, {"chan", "<-"}, {"=", "<-"}, {"'\\n'", "x"},
}

func scan(src []byte) ([]goldenToken, int) {
	fset := token.NewFileSet()
	file := fset.AddFile("", fset.Base(), len(src))
	errors := 0
	var s scanner.Scanner
	s.Init(file, src, func(token.Position, string) { errors++ }, 0)
	var tokens []goldenToken
	for {
		pos, tok, lit := s.Scan()
		if tok == token.EOF {
			return tokens, errors
		}
		if tok == token.SEMICOLON && lit == "\n" {
			continue // inserted automatically; not part of the source text
		}
		text := lit
		if text == "" {
			text = tok.String()
		}
		start := file.Offset(pos)
		tokens = append(tokens, goldenToken{Text: text, Start: start, End: start + len(text)})
	}
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "go-reference: "+format+"\n", args...)
	os.Exit(1)
}

func main() {
	if len(os.Args) != 3 {
		fail("usage: go-reference <fixtures-dir> <golden-json>")
	}
	dir, out := os.Args[1], os.Args[2]

	names, err := filepath.Glob(filepath.Join(dir, "*.go"))
	if err != nil || len(names) == 0 {
		fail("no Go fixtures in %s", dir)
	}
	sort.Strings(names)

	result := golden{GeneratedBy: runtime.Version() + " go/scanner"}
	seen := map[[2]string]bool{}
	var pairs [][2]string
	addPair := func(pair [2]string) {
		if !seen[pair] {
			seen[pair] = true
			pairs = append(pairs, pair)
		}
	}

	for _, name := range names {
		src, err := os.ReadFile(name)
		if err != nil {
			fail("%v", err)
		}

		// gofmt accepts declaration fragments only on standard input.
		cmd := exec.Command("gofmt")
		cmd.Stdin = bytes.NewReader(src)
		formatted, err := cmd.Output()
		if err != nil {
			fail("gofmt %s: %v", name, err)
		}
		if !bytes.Equal(formatted, src) {
			fail("%s is not gofmt output", name)
		}

		tokens, errors := scan(src)
		if errors > 0 {
			fail("%s: go/scanner reported %d error(s)", name, errors)
		}
		sum := sha256.Sum256(src)
		result.Fixtures = append(result.Fixtures, goldenFixture{
			Name:   filepath.Base(name),
			SHA256: hex.EncodeToString(sum[:]),
			Tokens: tokens,
		})
		for i := 1; i < len(tokens); i++ {
			gap := string(src[tokens[i-1].End:tokens[i].Start])
			if gap != "" && strings.Trim(gap, " ") == "" {
				addPair([2]string{tokens[i-1].Text, tokens[i].Text})
			}
		}
	}
	for _, pair := range extraPairs {
		addPair(pair)
	}

	for _, pair := range pairs {
		tokens, errors := scan([]byte(pair[0] + pair[1]))
		texts := make([]string, len(tokens))
		for i, t := range tokens {
			texts[i] = t.Text
		}
		result.Pairs = append(result.Pairs, goldenPair{Prev: pair[0], Next: pair[1], Tokens: texts, Errors: errors})
	}

	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		fail("%v", err)
	}
	if err := os.WriteFile(out, append(data, '\n'), 0o644); err != nil {
		fail("%v", err)
	}
	fmt.Printf("wrote %s: %d fixtures, %d pairs\n", out, len(result.Fixtures), len(result.Pairs))
}
