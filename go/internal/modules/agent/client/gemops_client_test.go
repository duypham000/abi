package client_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"tomo-backend/internal/modules/agent/client"
	"tomo-backend/internal/modules/agent/dto"
)

func TestGemOpsClient_UnixSocketTransport(t *testing.T) {
	sockPath := filepath.Join(os.TempDir(), fmt.Sprintf("gemops_%d.sock", time.Now().UnixNano()))
	_ = os.Remove(sockPath)
	t.Cleanup(func() { _ = os.Remove(sockPath) })

	ln, err := net.Listen("unix", sockPath)
	if err != nil {
		t.Skipf("unix domain sockets unsupported in this environment: %v", err)
	}
	defer ln.Close()

	srv := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL.Path == "/status" {
				w.Header().Set("Content-Type", "application/json")
				_ = json.NewEncoder(w).Encode(dto.GemOpsStatusResponse{
					State:           "IDLE",
					ActiveHarnessID: "unix-harness",
				})
				return
			}
			http.NotFound(w, r)
		}),
	}
	go func() { _ = srv.Serve(ln) }()
	defer srv.Close()

	c := client.NewGemOpsClient("-", sockPath)
	info := c.Info()
	if info.Mode != "unix" || info.Target != sockPath {
		t.Fatalf("expected unix transport targeting %q, got %+v", sockPath, info)
	}

	status, err := c.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus over unix socket failed: %v", err)
	}
	if status.ActiveHarnessID != "unix-harness" {
		t.Fatalf("expected activeHarnessId 'unix-harness', got %q", status.ActiveHarnessID)
	}

	ok, code, probeErr := c.CheckStatus(context.Background())
	if !ok || code != http.StatusOK || probeErr != "" {
		t.Fatalf("CheckStatus unexpected result: ok=%v code=%d err=%q", ok, code, probeErr)
	}
}

func TestGemOpsClient_FallbackToTCPWhenSocketMissing(t *testing.T) {
	tcpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/status" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(dto.GemOpsStatusResponse{
				State:           "IDLE",
				ActiveHarnessID: "tcp-fallback",
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer tcpSrv.Close()

	missingSock := filepath.Join(os.TempDir(), fmt.Sprintf("missing_gemops_%d.sock", time.Now().UnixNano()))
	_ = os.Remove(missingSock)

	c := client.NewGemOpsClient(tcpSrv.URL, missingSock)
	info := c.Info()
	if info.Mode != "tcp" || info.Target != tcpSrv.URL {
		t.Fatalf("expected tcp fallback targeting %q, got %+v", tcpSrv.URL, info)
	}

	status, err := c.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus TCP fallback failed: %v", err)
	}
	if status.ActiveHarnessID != "tcp-fallback" {
		t.Fatalf("expected 'tcp-fallback', got %q", status.ActiveHarnessID)
	}
}

func TestGemOpsClient_DashDisablesUnixSocket(t *testing.T) {
	tcpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/status" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(dto.GemOpsStatusResponse{
				State:           "IDLE",
				ActiveHarnessID: "forced-tcp",
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer tcpSrv.Close()

	c := client.NewGemOpsClient(tcpSrv.URL, "-")
	info := c.Info()
	if info.Mode != "tcp" || info.Target != tcpSrv.URL || info.SocketPath != "" {
		t.Fatalf("expected forced tcp transport, got %+v", info)
	}

	status, err := c.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("GetStatus forced TCP failed: %v", err)
	}
	if status.ActiveHarnessID != "forced-tcp" {
		t.Fatalf("expected 'forced-tcp', got %q", status.ActiveHarnessID)
	}
}

func TestGemOpsClient_DashDisablesTCPAndReturnsConnectionError(t *testing.T) {
	missingSock := filepath.Join(os.TempDir(), fmt.Sprintf("missing_unix_only_%d.sock", time.Now().UnixNano()))
	_ = os.Remove(missingSock)

	c := client.NewGemOpsClient("-", missingSock)
	info := c.Info()
	if info.Mode != "unix" || info.Target != missingSock || info.TCPURL != "" {
		t.Fatalf("expected unix-only transport, got %+v", info)
	}

	_, err := c.GetStatus(context.Background())
	if err == nil {
		t.Fatal("expected connection error when unix socket is missing and TCP is disabled")
	}

	var connErr *client.ConnectionError
	if !errors.As(err, &connErr) {
		t.Fatalf("expected *client.ConnectionError, got %T (%v)", err, err)
	}
	if connErr.Transport.Mode != "unix" || connErr.Transport.Target != missingSock {
		t.Fatalf("unexpected ConnectionError transport metadata: %+v", connErr.Transport)
	}
}

func TestGemOpsClient_RuntimeFallbackWhenUnixDialFails(t *testing.T) {
	staleSock := filepath.Join(os.TempDir(), fmt.Sprintf("stale_gemops_%d.sock", time.Now().UnixNano()))
	_ = os.Remove(staleSock)
	if err := os.WriteFile(staleSock, []byte("stale"), 0600); err != nil {
		t.Fatalf("failed to create stale socket file: %v", err)
	}
	t.Cleanup(func() { _ = os.Remove(staleSock) })

	tcpSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/status" {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(dto.GemOpsStatusResponse{
				State:           "IDLE",
				ActiveHarnessID: "runtime-tcp-fallback",
			})
			return
		}
		http.NotFound(w, r)
	}))
	defer tcpSrv.Close()

	c := client.NewGemOpsClient(tcpSrv.URL, staleSock)
	status, err := c.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("expected runtime fallback to TCP to succeed, got error: %v", err)
	}
	if status.ActiveHarnessID != "runtime-tcp-fallback" {
		t.Fatalf("expected activeHarnessId 'runtime-tcp-fallback', got %q", status.ActiveHarnessID)
	}

	ok, code, probeErr := c.CheckStatus(context.Background())
	if !ok || code != http.StatusOK || probeErr != "" {
		t.Fatalf("CheckStatus runtime fallback failed: ok=%v code=%d err=%q", ok, code, probeErr)
	}
}

func TestGemOpsClient_AutoDetectsGemOpsWebGatewayPrefixAndAuth(t *testing.T) {
	gwSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/status":
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte("<!doctype html><html><body>gemops-web UI</body></html>"))
		case "/api/agent/status":
			if r.Header.Get("Authorization") != "Bearer secret-tok" {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusUnauthorized)
				_, _ = w.Write([]byte(`{"error":"unauthorized"}`))
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(dto.GemOpsStatusResponse{
				State:           "IDLE",
				ActiveHarnessID: "gemops-web-gateway",
			})
		default:
			http.NotFound(w, r)
		}
	}))
	defer gwSrv.Close()

	c := client.NewGemOpsClientWithOptions(client.ClientOptions{
		BaseURL:    gwSrv.URL,
		SocketPath: "-",
		AuthToken:  "secret-tok",
	})

	status, err := c.GetStatus(context.Background())
	if err != nil {
		t.Fatalf("expected auto-detected /api/agent gateway to succeed, got: %v", err)
	}
	if status.ActiveHarnessID != "gemops-web-gateway" {
		t.Fatalf("expected 'gemops-web-gateway', got %q", status.ActiveHarnessID)
	}

	info := c.Info()
	if info.Mode != "tcp" || info.Target != gwSrv.URL+"/api/agent" {
		t.Fatalf("expected cached /api/agent prefix in Info(), got %+v", info)
	}

	ok, code, probeErr := c.CheckStatus(context.Background())
	if !ok || code != http.StatusOK || probeErr != "" {
		t.Fatalf("CheckStatus over /api/agent failed: ok=%v code=%d err=%q", ok, code, probeErr)
	}
}
