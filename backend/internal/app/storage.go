package app

import (
	"context"
	"io"
	"os"
	"path/filepath"
)

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
	return &LocalStorage{rootDir: rootDir}, nil
}

func (l *LocalStorage) Save(ctx context.Context, name string, body io.Reader) (string, error) {
	fullPath := filepath.Join(l.rootDir, name)
	f, err := os.Create(fullPath)
	if err != nil {
		return "", err
	}
	defer f.Close()
	_, err = io.Copy(f, body)
	return fullPath, err
}

func (l *LocalStorage) Open(ctx context.Context, path string) (io.ReadCloser, error) {
	return os.Open(path)
}

func (l *LocalStorage) Delete(ctx context.Context, path string) error {
	if path == "" {
		return nil
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}
