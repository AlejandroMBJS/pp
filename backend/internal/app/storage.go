package app

import (
	"context"
	"errors"
	"io"
	"os"
	"path/filepath"
	"strings"
)

var errUnsafePath = errors.New("unsafe file path")

type FileStorage interface {
	Save(ctx context.Context, name string, body io.Reader) (string, error)
	Open(ctx context.Context, path string) (io.ReadCloser, error)
	Delete(ctx context.Context, path string) error
}

type LocalStorage struct {
	rootDir string
}

func NewLocalStorage(rootDir string) (*LocalStorage, error) {
	if err := os.MkdirAll(rootDir, 0o755); err != nil {
		return nil, err
	}
	abs, err := filepath.Abs(rootDir)
	if err != nil {
		return nil, err
	}
	return &LocalStorage{rootDir: abs}, nil
}

// resolveInside returns the cleaned absolute path of `name` under rootDir,
// rejecting path traversal (../), absolute paths, and any escape attempts.
func (l *LocalStorage) resolveInside(name string) (string, error) {
	if name == "" || strings.Contains(name, "\x00") {
		return "", errUnsafePath
	}
	// Normalize slashes and drop any drive/root. Keep only the last segment's
	// relative shape via Clean, then reject if it escapes.
	clean := filepath.Clean("/" + filepath.ToSlash(name))
	clean = strings.TrimPrefix(clean, "/")
	if clean == "" || clean == "." {
		return "", errUnsafePath
	}
	full := filepath.Join(l.rootDir, clean)
	abs, err := filepath.Abs(full)
	if err != nil {
		return "", err
	}
	if abs != l.rootDir && !strings.HasPrefix(abs, l.rootDir+string(filepath.Separator)) {
		return "", errUnsafePath
	}
	return abs, nil
}

func (l *LocalStorage) Save(ctx context.Context, name string, body io.Reader) (string, error) {
	fullPath, err := l.resolveInside(name)
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(filepath.Dir(fullPath), 0o755); err != nil {
		return "", err
	}
	f, err := os.Create(fullPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	_, err = io.Copy(f, body)
	return fullPath, err
}

func (l *LocalStorage) Open(ctx context.Context, path string) (io.ReadCloser, error) {
	// path may be absolute (as returned from Save) or a relative name.
	abs, err := filepath.Abs(path)
	if err != nil {
		return nil, err
	}
	if abs != l.rootDir && !strings.HasPrefix(abs, l.rootDir+string(filepath.Separator)) {
		return nil, errUnsafePath
	}
	return os.Open(abs)
}

func (l *LocalStorage) Delete(ctx context.Context, path string) error {
	if path == "" {
		return nil
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return err
	}
	if abs != l.rootDir && !strings.HasPrefix(abs, l.rootDir+string(filepath.Separator)) {
		return errUnsafePath
	}
	if err := os.Remove(abs); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
