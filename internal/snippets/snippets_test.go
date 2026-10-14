package snippets

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func open(t *testing.T) (*Store, string) {
	t.Helper()
	dir := t.TempDir()
	s, err := Open(dir)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = s.Close() })
	if !s.Persistent {
		t.Fatal("expected a persistent store in a writable dir")
	}
	return s, filepath.Join(dir, "snippets")
}

func TestCleanRejectsUnsafePaths(t *testing.T) {
	for _, p := range []string{
		"", "../x.sql", "a/../../x.sql", "/etc/x.sql", "a//b.sql", "a/./b.sql", "./a.sql", ".",
		"..", ".hidden.sql", "a/.git/b.sql", `a\b.sql`, "a.sql/", "x.txt", "x", "a\x00.sql",
	} {
		if _, err := Clean(p, true); !errors.Is(err, ErrInvalid) {
			t.Errorf("Clean(%q, file) = %v, want ErrInvalid", p, err)
		}
	}
	for _, p := range []string{"reports.sql", "../up", "/abs", ".hidden", "a/../b"} {
		if _, err := Clean(p, false); !errors.Is(err, ErrInvalid) {
			t.Errorf("Clean(%q, folder) = %v, want ErrInvalid", p, err)
		}
	}
	for _, p := range []string{"a.sql", "reports/monthly.sql", "año/consulta 1.sql"} {
		if got, err := Clean(p, true); err != nil || got != p {
			t.Errorf("Clean(%q, file) = %q, %v", p, got, err)
		}
	}
}

func TestCRUDAndFolders(t *testing.T) {
	s, _ := open(t)

	if _, err := s.Create("reports/monthly.sql", "select 1"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Create("reports/monthly.sql", "select 2"); !errors.Is(err, ErrExists) {
		t.Fatalf("create twice: %v, want ErrExists", err)
	}
	got, err := s.Update("reports/monthly.sql", "select 2")
	if err != nil || got.SQL != "select 2" {
		t.Fatalf("update: %+v %v", got, err)
	}
	if _, err := s.Update("nope.sql", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("update missing: %v", err)
	}
	if err := s.MkdirAll("empty/inner"); err != nil {
		t.Fatal(err)
	}
	if err := s.MkdirAll("empty/inner"); !errors.Is(err, ErrExists) {
		t.Fatalf("mkdir twice: %v", err)
	}
	if err := s.Move("reports/monthly.sql", "archive/2024.sql"); err != nil {
		t.Fatal(err)
	}
	if err := s.Move("archive", "archive/sub"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("move folder into itself: %v", err)
	}
	if err := s.Move("archive/2024.sql", "archive"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("file renamed without .sql: %v", err)
	}
	if err := s.Move("missing.sql", "x.sql"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("move missing: %v", err)
	}
	if err := s.Move("empty", "renamed"); err != nil {
		t.Fatal(err)
	}

	list, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	var paths []string
	for _, e := range list {
		paths = append(paths, e.Path)
	}
	want := "archive archive/2024.sql renamed renamed/inner reports"
	if strings.Join(paths, " ") != want {
		t.Fatalf("list = %v, want %s", paths, want)
	}

	if err := s.Delete("archive"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get("archive/2024.sql"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("get after delete: %v", err)
	}
	if err := s.Delete("archive"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("delete twice: %v", err)
	}
}

func TestSizeLimitAndAtomicWrite(t *testing.T) {
	s, dir := open(t)
	if _, err := s.Create("big.sql", strings.Repeat("x", MaxSize+1)); !errors.Is(err, ErrTooLarge) {
		t.Fatalf("create too large: %v", err)
	}
	if _, err := s.Create("ok.sql", strings.Repeat("x", MaxSize)); err != nil {
		t.Fatal(err)
	}
	// No temporary files are left behind.
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.Name() != "ok.sql" {
			t.Errorf("unexpected file %s", e.Name())
		}
	}
}

func TestSymlinksCannotEscape(t *testing.T) {
	s, dir := open(t)
	outside := t.TempDir()
	if err := os.WriteFile(filepath.Join(outside, "secret.sql"), []byte("secret"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(outside, filepath.Join(dir, "link")); err != nil {
		t.Skip("symlinks not supported:", err)
	}
	if err := os.Symlink(filepath.Join(outside, "secret.sql"), filepath.Join(dir, "file.sql")); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Get("link/secret.sql"); err == nil {
		t.Fatal("read through a symlinked folder")
	}
	if _, err := s.Get("file.sql"); err == nil {
		t.Fatal("read through a symlinked file")
	}
	if _, err := s.Create("link/new.sql", "x"); err == nil {
		t.Fatal("wrote through a symlinked folder")
	}
	if _, err := os.Stat(filepath.Join(outside, "new.sql")); err == nil {
		t.Fatal("file created outside the snippets dir")
	}
	list, err := s.List()
	if err != nil || len(list) != 0 {
		t.Fatalf("symlinks listed: %+v %v", list, err)
	}
}

func TestFallsBackToTemporaryDir(t *testing.T) {
	// A file where the data dir should be: the snippets dir cannot be created.
	blocker := filepath.Join(t.TempDir(), "data")
	if err := os.WriteFile(blocker, nil, 0o600); err != nil {
		t.Fatal(err)
	}
	s, err := Open(blocker)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = s.Close() }()
	if s.Persistent {
		t.Fatal("expected a non-persistent store")
	}
	if _, err := s.Create("a.sql", "select 1"); err != nil {
		t.Fatalf("the fallback store must work: %v", err)
	}
}

func TestPrivateStoresAreSeparate(t *testing.T) {
	s, dir := open(t)
	if _, err := s.Create("shared.sql", "SELECT 0"); err != nil {
		t.Fatal(err)
	}
	ana, err := s.Private("ana@db:5432/sales")
	if err != nil {
		t.Fatal(err)
	}
	defer ana.Close()
	if _, err := ana.Create("mine.sql", "SELECT 1"); err != nil {
		t.Fatal(err)
	}
	// Another owner (a different port is another server) sees nothing of it.
	other, err := s.Private("ana@db:5433/sales")
	if err != nil {
		t.Fatal(err)
	}
	defer other.Close()
	for name, st := range map[string]*Store{"other": other, "ana": ana} {
		list, err := st.List()
		if err != nil {
			t.Fatal(err)
		}
		want := map[string]int{"other": 0, "ana": 1}[name]
		if len(list) != want || want == 1 && list[0].Path != "mine.sql" {
			t.Errorf("%s list = %+v", name, list)
		}
	}
	// The same owner later finds it again.
	again, err := s.Private("ana@db:5432/sales")
	if err != nil {
		t.Fatal(err)
	}
	defer again.Close()
	if got, err := again.Get("mine.sql"); err != nil || got.SQL != "SELECT 1" {
		t.Errorf("again = %+v %v", got, err)
	}
	// The shared store neither lists the private ones nor reaches them by path.
	list, err := s.List()
	if err != nil {
		t.Fatal(err)
	}
	if len(list) != 1 || list[0].Path != "shared.sql" {
		t.Errorf("shared list = %+v", list)
	}
	entries, _ := os.ReadDir(filepath.Join(dir, privateDir))
	if len(entries) != 2 {
		t.Fatalf("private folders = %d", len(entries))
	}
	if _, err := s.Get(privateDir + "/" + entries[0].Name() + "/mine.sql"); !errors.Is(err, ErrInvalid) {
		t.Errorf("shared store reached a private one: %v", err)
	}
	// And a private store can't climb out to the shared one.
	if _, err := ana.Get("../../shared.sql"); !errors.Is(err, ErrInvalid) {
		t.Errorf("private store escaped: %v", err)
	}
}
