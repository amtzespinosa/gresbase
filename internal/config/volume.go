package config

import (
	"os"
	"path/filepath"
	"regexp"
	"strings"
)

// Why the data directory would not keep its files (Store.Loss). Empty means it would: a named
// volume, a bind mount, or not in a container.
const (
	LossNotWritable     = "not_writable"     // nothing can be written: lost on restart
	LossTmpfs           = "tmpfs"            // in memory: lost on restart
	LossAnonymousVolume = "anonymous_volume" // Docker's VOLUME default: lost when the container is removed
	LossContainerLayer  = "container_layer"  // no mount at all: lost when the container is removed
)

// anonymous volumes are named by 64 hex digits (Docker and Podman).
var anonymousVolume = regexp.MustCompile(`/volumes/[0-9a-f]{64}/_data$`)

// DataLoss tells whether dir would lose its files with the container, from the mounts of this
// process. The image declares VOLUME /data, so without -v Docker mounts a writable anonymous volume
// there: writable is not enough to know the data survives.
func DataLoss(dir string) string {
	info, err := os.ReadFile("/proc/self/mountinfo")
	if err != nil {
		return "" // not Linux, or no /proc: nothing to tell
	}
	return dataLoss(string(info), dir, InContainer())
}

// InContainer reports whether Gresbase runs in a Docker or Podman container.
func InContainer() bool {
	for _, f := range []string{"/.dockerenv", "/run/.containerenv"} {
		if _, err := os.Stat(f); err == nil {
			return true
		}
	}
	return false
}

// dataLoss reads mountinfo (proc(5)): the mount holding dir is the one with the longest mount point
// that contains it.
func dataLoss(mountinfo, dir string, container bool) string {
	dir = filepath.Clean(dir)
	var point, root, fstype string
	for _, line := range strings.Split(mountinfo, "\n") {
		fields := strings.Fields(line)
		sep := -1
		for i, f := range fields {
			if f == "-" {
				sep = i
				break
			}
		}
		if len(fields) < 5 || sep < 0 || sep+1 >= len(fields) {
			continue
		}
		p := unescape(fields[4])
		if !within(dir, p) || len(p) < len(point) {
			continue
		}
		point, root, fstype = p, unescape(fields[3]), fields[sep+1]
	}
	switch {
	case point == "":
		return ""
	case fstype == "tmpfs" && point == dir:
		return LossTmpfs
	case point == dir && anonymousVolume.MatchString(root):
		return LossAnonymousVolume
	case point == "/" && container:
		return LossContainerLayer
	}
	return ""
}

func within(dir, point string) bool {
	return point == "/" || dir == point || strings.HasPrefix(dir, point+"/")
}

// unescape undoes the octal escapes of mountinfo paths (\040 for a space, and so on).
func unescape(s string) string {
	if !strings.Contains(s, `\`) {
		return s
	}
	var b strings.Builder
	for i := 0; i < len(s); i++ {
		if s[i] == '\\' && i+3 < len(s) && isOctal(s[i+1]) && isOctal(s[i+2]) && isOctal(s[i+3]) {
			b.WriteByte((s[i+1]-'0')<<6 | (s[i+2]-'0')<<3 | (s[i+3] - '0'))
			i += 3
			continue
		}
		b.WriteByte(s[i])
	}
	return b.String()
}

func isOctal(c byte) bool { return c >= '0' && c <= '7' }

// SetupTokenFile holds the generated setup token while in setup mode (mode 0600, removed when setup
// completes), so `gresbase setup-token` run inside the container can print it.
func SetupTokenFile() string { return filepath.Join(os.TempDir(), "gresbase-setup-token") }
