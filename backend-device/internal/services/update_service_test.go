// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package services

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestUpdateServiceFindsANewerRelease(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`[
			{"tag_name":"v0.3.0","html_url":"https://example.com/v0.3.0","draft":true},
			{"tag_name":"v0.2.1","html_url":"https://example.com/v0.2.1","draft":false},
			{"tag_name":"v0.1.0","html_url":"https://example.com/v0.1.0","draft":false},
			{"tag_name":"nightly","html_url":"https://example.com/nightly","draft":false}
		]`))
	}))
	defer srv.Close()
	check := func(current string) string {
		info, err := NewUpdateService(UpdateConfig{Current: current, URL: srv.URL}).Check(context.Background())
		if err != nil {
			t.Fatal(err)
		}
		return info.Latest
	}
	if got := check("v0.1.0"); got != "v0.2.1" {
		t.Fatalf("from v0.1.0: %q (drafts and non-versions are skipped)", got)
	}
	if got := check("v0.2.1"); got != "" {
		t.Fatalf("up to date: %q", got)
	}
	if got := check("v0.3.0-dev"); got != "" {
		t.Fatalf("a newer build: %q", got)
	}
	if _, ok := parseVersion("da1aa4e"); ok {
		t.Fatal("a commit hash is not a version")
	}
}
