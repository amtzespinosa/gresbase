// Package snippets stores saved queries as .sql files under the data directory.
//
// Paths are relative, slash-separated and confined to the snippets directory: every file operation
// goes through an os.Root, so neither ".." nor a symlink can reach outside it.
package snippets

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
)

// MaxSize is the largest snippet accepted, in bytes.
const MaxSize = 1 << 20

// Errors the API maps to 400, 404, 409 and 413.
var (
	ErrInvalid  = errors.New("invalid snippet path")
	ErrNotFound = errors.New("snippet not found")
	ErrExists   = errors.New("snippet already exists")
	ErrTooLarge = errors.New("snippet is larger than 1 MB")
)

// Store reads and writes the snippets of one directory.
type Store struct {
	root *os.Root
	// Persistent is false when the data dir was not writable and the store lives in a temporary
	// directory that disappears with the container.
	Persistent bool
}

// Open uses dataDir/snippets, creating it if needed. If that is not possible it falls back to a
// fresh temporary directory (Persistent false), so the API keeps working.
func Open(dataDir string) (*Store, error) {
	dir := filepath.Join(dataDir, "snippets")
	if err := os.MkdirAll(dir, 0o750); err == nil && writable(dir) {
		if root, err := os.OpenRoot(dir); err == nil {
			return &Store{root: root, Persistent: true}, nil
		}
	}
	// ponytail: a temp dir instead of an in-memory store, same code path; lost on restart either way.
	tmp, err := os.MkdirTemp("", "gresbase-snippets-")
	if err != nil {
		return nil, fmt.Errorf("snippets: no writable directory: %w", err)
	}
	root, err := os.OpenRoot(tmp)
	if err != nil {
		return nil, fmt.Errorf("snippets: %w", err)
	}
	return &Store{root: root}, nil
}

func writable(dir string) bool {
	f, err := os.CreateTemp(dir, ".probe-*")
	if err != nil {
		return false
	}
	_ = f.Close()
	_ = os.Remove(f.Name())
	return true
}

// Close releases the directory.
func (s *Store) Close() error { return s.root.Close() }

// privateDir holds the private stores. Its name starts with a dot, so List skips it and Clean
// rejects every path into it: the shared store never reaches a private one.
const privateDir = ".private"

// Private opens the store of one owner (a free mode user: user@host:port/database), in a folder
// named by a hash of the owner, creating it if needed. The caller closes it.
func (s *Store) Private(owner string) (*Store, error) {
	sum := sha256.Sum256([]byte(owner))
	dir := privateDir + "/" + hex.EncodeToString(sum[:16])
	if err := s.root.MkdirAll(dir, 0o750); err != nil {
		return nil, fmt.Errorf("snippets: private folder: %w", err)
	}
	root, err := s.root.OpenRoot(dir)
	if err != nil {
		return nil, fmt.Errorf("snippets: private folder: %w", err)
	}
	return &Store{root: root, Persistent: s.Persistent}, nil
}

// Clean validates a client path: relative, slash-separated, no "." or ".." segments, no hidden
// segments (temporary files start with a dot) and no backslashes. Files must end in .sql.
func Clean(p string, file bool) (string, error) {
	if p == "" || strings.ContainsAny(p, "\\\x00") || !filepath.IsLocal(p) || path.Clean(p) != p {
		return "", fmt.Errorf("%w: %q", ErrInvalid, p)
	}
	for _, seg := range strings.Split(p, "/") {
		if strings.HasPrefix(seg, ".") {
			return "", fmt.Errorf("%w: %q", ErrInvalid, p)
		}
	}
	if file != strings.HasSuffix(p, ".sql") {
		if file {
			return "", fmt.Errorf("%w: %q must end in .sql", ErrInvalid, p)
		}
		return "", fmt.Errorf("%w: folder %q cannot end in .sql", ErrInvalid, p)
	}
	return p, nil
}

// List returns every folder and .sql file, sorted by path.
func (s *Store) List() ([]Entry, error) {
	out := []Entry{}
	err := fs.WalkDir(s.root.FS(), ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if p == "." {
			return nil
		}
		if strings.HasPrefix(d.Name(), ".") {
			if d.IsDir() {
				return fs.SkipDir
			}
			return nil
		}
		if !d.IsDir() && (!d.Type().IsRegular() || !strings.HasSuffix(p, ".sql")) {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		e := Entry{Path: p, Folder: d.IsDir(), ModifiedAt: info.ModTime().UTC()}
		if !e.Folder {
			e.Size = info.Size()
		}
		out = append(out, e)
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("snippets: list: %w", err)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Path < out[j].Path })
	return out, nil
}

// Get reads one snippet.
func (s *Store) Get(p string) (Snippet, error) {
	p, err := Clean(p, true)
	if err != nil {
		return Snippet{}, err
	}
	info, err := s.root.Stat(p)
	if err != nil {
		return Snippet{}, notFound(err, p)
	}
	if !info.Mode().IsRegular() {
		return Snippet{}, fmt.Errorf("%w: %s", ErrNotFound, p)
	}
	if info.Size() > MaxSize {
		return Snippet{}, ErrTooLarge
	}
	b, err := s.root.ReadFile(p)
	if err != nil {
		return Snippet{}, notFound(err, p)
	}
	return Snippet{Path: p, SQL: string(b), ModifiedAt: info.ModTime().UTC()}, nil
}

// Create saves a new snippet, creating its folders; ErrExists if the path is taken.
func (s *Store) Create(p, sql string) (Snippet, error) {
	p, err := Clean(p, true)
	if err != nil {
		return Snippet{}, err
	}
	if _, err := s.root.Lstat(p); err == nil {
		return Snippet{}, fmt.Errorf("%w: %s", ErrExists, p)
	}
	if dir := path.Dir(p); dir != "." {
		if err := s.root.MkdirAll(dir, 0o750); err != nil {
			return Snippet{}, fmt.Errorf("snippets: create folder: %w", err)
		}
	}
	return s.write(p, sql)
}

// Update replaces the content of an existing snippet.
func (s *Store) Update(p, sql string) (Snippet, error) {
	p, err := Clean(p, true)
	if err != nil {
		return Snippet{}, err
	}
	if info, err := s.root.Stat(p); err != nil || !info.Mode().IsRegular() {
		return Snippet{}, fmt.Errorf("%w: %s", ErrNotFound, p)
	}
	return s.write(p, sql)
}

// write replaces p atomically: a temporary file in the same folder, then a rename over p.
func (s *Store) write(p, sql string) (Snippet, error) {
	if len(sql) > MaxSize {
		return Snippet{}, ErrTooLarge
	}
	var rnd [8]byte
	_, _ = rand.Read(rnd[:])
	tmp := path.Join(path.Dir(p), "."+path.Base(p)+"."+hex.EncodeToString(rnd[:])+".tmp")
	f, err := s.root.OpenFile(tmp, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o640)
	if err != nil {
		return Snippet{}, fmt.Errorf("snippets: write: %w", err)
	}
	_, werr := f.WriteString(sql)
	if werr == nil {
		werr = f.Sync()
	}
	if cerr := f.Close(); werr == nil {
		werr = cerr
	}
	if werr == nil {
		werr = s.root.Rename(tmp, p)
	}
	if werr != nil {
		_ = s.root.Remove(tmp)
		return Snippet{}, fmt.Errorf("snippets: write: %w", werr)
	}
	return s.Get(p)
}

// cleanAny validates a path to a snippet (ends in .sql) or to a folder (anything else).
func cleanAny(p string) (string, error) { return Clean(p, strings.HasSuffix(p, ".sql")) }

// Move renames or moves a snippet or a folder; ErrExists if the target is taken.
func (s *Store) Move(from, to string) error {
	from, err := cleanAny(from)
	if err != nil {
		return err
	}
	if to, err = Clean(to, strings.HasSuffix(from, ".sql")); err != nil {
		return err
	}
	if to == from || strings.HasPrefix(to, from+"/") {
		return fmt.Errorf("%w: cannot move %q into itself", ErrInvalid, from)
	}
	if _, err := s.root.Lstat(from); err != nil {
		return notFound(err, from)
	}
	if _, err := s.root.Lstat(to); err == nil {
		return fmt.Errorf("%w: %s", ErrExists, to)
	}
	if dir := path.Dir(to); dir != "." {
		if err := s.root.MkdirAll(dir, 0o750); err != nil {
			return fmt.Errorf("snippets: move: %w", err)
		}
	}
	if err := s.root.Rename(from, to); err != nil {
		return fmt.Errorf("snippets: move: %w", err)
	}
	return nil
}

// Delete removes a snippet, or a folder with everything in it.
func (s *Store) Delete(p string) error {
	p, err := cleanAny(p)
	if err != nil {
		return err
	}
	if _, err := s.root.Lstat(p); err != nil {
		return notFound(err, p)
	}
	if err := s.root.RemoveAll(p); err != nil {
		return fmt.Errorf("snippets: delete: %w", err)
	}
	return nil
}

// MkdirAll creates a folder (and its parents).
func (s *Store) MkdirAll(p string) error {
	p, err := Clean(p, false)
	if err != nil {
		return err
	}
	if _, err := s.root.Lstat(p); err == nil {
		return fmt.Errorf("%w: %s", ErrExists, p)
	}
	if err := s.root.MkdirAll(p, 0o750); err != nil {
		return fmt.Errorf("snippets: create folder: %w", err)
	}
	return nil
}

func notFound(err error, p string) error {
	if errors.Is(err, fs.ErrNotExist) {
		return fmt.Errorf("%w: %s", ErrNotFound, p)
	}
	return fmt.Errorf("snippets: %w", err)
}
