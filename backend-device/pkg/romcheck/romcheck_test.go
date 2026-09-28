// Copyright (c) 2026 Federico Pereira <lord.basex@gmail.com>

package romcheck

import (
	"archive/zip"
	"fmt"
	"hash/crc32"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

const testXML = `<?xml version="1.0"?>
<!DOCTYPE mame [
<!ELEMENT mame (game+)>
]>
<mame build="0.78">
	<game name="neogeo" runnable="no">
		<description>Neo-Geo</description>
		<manufacturer>SNK</manufacturer>
		<biosset name="euro" description="Europe" default="yes"/>
		<biosset name="us" description="US"/>
		<rom name="sp-s2.sp1" bios="euro" size="4" crc="` + crcA + `"/>
		<rom name="usa_2slt.bin" bios="us" size="4" crc="` + crcC + `"/>
	</game>
	<game name="kof97" romof="neogeo">
		<description>The King of Fighters &apos;97</description>
		<year>1997</year>
		<manufacturer>SNK</manufacturer>
		<rom name="232-p1.bin" size="4" crc="` + crcB + `"/>
		<biosset name="euro" description="Europe" default="yes"/>
		<biosset name="us" description="US"/>
		<rom name="sp-s2.sp1" merge="sp-s2.sp1" bios="euro" size="4" crc="` + crcA + `"/>
		<rom name="usa_2slt.bin" merge="usa_2slt.bin" bios="us" size="4" crc="` + crcC + `"/>
		<input players="2" control="joy8way" buttons="4" coins="2"/>
		<driver status="good"/>
	</game>
	<game name="robby">
		<description>Robby Roto</description>
		<year>1981</year>
		<manufacturer>Bally Midway</manufacturer>
		<rom name="ROBBY1.bin" size="4" crc="` + crcB + `"/>
		<rom name="robby2.bin" size="4" crc="` + crcC + `"/>
		<rom name="robby2.bin" size="4" crc="` + crcC + `"/>
		<rom name="prom.bin" size="32" status="nodump"/>
		<driver status="preliminary"/>
	</game>
	<game name="jdredd">
		<description>Judge Dredd</description>
		<rom name="jd.bin" size="4" crc="` + crcA + `"/>
		<disk name="jdreddc.chd" sha1="00"/>
	</game>
</mame>`

// The CRC32 of the contents "aaaa", "bbbb" and "cccc".
const (
	crcA = "ad98e545"
	crcB = "0f4ff68b"
	crcC = "d82dfa0e"
)

func writeZip(t *testing.T, path string, files map[string]string) {
	t.Helper()
	f, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	zw := zip.NewWriter(f)
	for name, body := range files {
		w, err := zw.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		w.Write([]byte(body))
	}
	if err := zw.Close(); err != nil {
		t.Fatal(err)
	}
	f.Close()
}

func TestTestCRCs(t *testing.T) {
	for body, want := range map[string]string{"aaaa": crcA, "bbbb": crcB, "cccc": crcC} {
		if got := fmt.Sprintf("%08x", crc32.ChecksumIEEE([]byte(body))); got != want {
			t.Errorf("crc(%s) = %s, want %s", body, got, want)
		}
	}
}

func TestParseXML(t *testing.T) {
	cat, err := ParseXML(strings.NewReader(testXML))
	if err != nil {
		t.Fatal(err)
	}
	if len(cat.Games) != 4 {
		t.Fatalf("games = %d", len(cat.Games))
	}
	k := cat.Game("kof97")
	if k.Title != "The King of Fighters '97" || k.Year != "1997" || k.RomOf != "neogeo" {
		t.Fatalf("kof97 = %+v", k)
	}
	if in := k.Input; in.Players != 2 || in.Buttons != 4 || in.Control != "joy8way" {
		t.Fatalf("kof97 input = %+v", in)
	}
	if in := cat.Game("robby").Input; in != (Input{}) {
		t.Fatalf("a game without <input> = %+v", in)
	}
	if !cat.Game("neogeo").BIOS {
		t.Fatal("neogeo must be a BIOS")
	}
	r := cat.Game("robby")
	if len(r.Roms) != 3 || r.Roms[0].Name != "robby1.bin" || !r.Roms[2].NoDump {
		t.Fatalf("robby roms = %+v", r.Roms)
	}
	if d := cat.Game("jdredd").Roms[1]; !d.Disk || d.Name != "jdreddc" {
		t.Fatalf("disk = %+v", d)
	}
	path := filepath.Join(t.TempDir(), FileName)
	if err := cat.Save(path); err != nil {
		t.Fatal(err)
	}
	back, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(back.Game("robby"), r) || back.Game("kof97").Input != k.Input {
		t.Fatal("save and load must round trip")
	}
}

func TestCheck(t *testing.T) {
	cat, err := ParseXML(strings.NewReader(testXML))
	if err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	// Exact names, in a subfolder of the zip: fine.
	writeZip(t, filepath.Join(dir, "robby.zip"), map[string]string{"x/robby1.bin": "bbbb", "robby2.bin": "cccc"})
	// A renamed file is found by its CRC.
	writeZip(t, filepath.Join(dir, "kof97.zip"), map[string]string{"renamed.p1": "bbbb"})
	writeZip(t, filepath.Join(dir, "jdredd.zip"), map[string]string{"jd.bin": "aaaa"})
	writeZip(t, filepath.Join(dir, "newgame.zip"), map[string]string{"a": "aaaa"})
	os.WriteFile(filepath.Join(dir, "broken.zip"), []byte("PK\x03\x04 not really"), 0o644)
	check := func(name string) Result { return NewChecker(cat, dir).Check(name) }

	if got := check("robby"); got.Status != StatusOK || got.Driver != "preliminary" {
		t.Fatalf("robby = %+v", got)
	}
	// The BIOS is missing: the merged file cannot be found.
	got := check("kof97")
	if got.Status != StatusMissing || !reflect.DeepEqual(got.Missing, []string{"sp-s2.sp1"}) || !reflect.DeepEqual(got.Needs, []string{"neogeo"}) {
		t.Fatalf("kof97 without the BIOS = %+v", got)
	}
	if got := check("jdredd"); got.Status != StatusMissing || !reflect.DeepEqual(got.Missing, []string{"jdreddc.chd"}) {
		t.Fatalf("jdredd without its disk = %+v", got)
	}
	if got := check("newgame"); got.Status != StatusUnsupported {
		t.Fatalf("newgame = %+v", got)
	}
	if got := check("broken"); got.Status != StatusBadZip {
		t.Fatalf("broken = %+v", got)
	}

	// With the BIOS (a wrong size by name still loads) and the disk.
	writeZip(t, filepath.Join(dir, "neogeo.zip"), map[string]string{"SP-S2.SP1": "wrong size"})
	os.MkdirAll(filepath.Join(dir, "jdredd"), 0o755)
	os.WriteFile(filepath.Join(dir, "jdredd", "jdreddc.chd"), []byte("chd"), 0o644)
	for _, name := range []string{"kof97", "jdredd"} {
		if got := check(name); got.Status != StatusOK {
			t.Fatalf("%s = %+v", name, got)
		}
	}
	if got := check("neogeo"); got.Status != StatusBIOS {
		t.Fatalf("neogeo = %+v", got)
	}
	// robby without one file.
	writeZip(t, filepath.Join(dir, "robby.zip"), map[string]string{"robby1.bin": "bbbb"})
	if got := check("robby"); got.Status != StatusMissing || !reflect.DeepEqual(got.Missing, []string{"robby2.bin"}) || got.Needs != nil {
		t.Fatalf("robby with a missing file = %+v", got)
	}
}

// TestRealList checks the real mame2003-plus list when one is at hand:
// ROMCHECK_XML=path/to/mame2003-plus.xml go test ./pkg/romcheck
func TestRealList(t *testing.T) {
	path := os.Getenv("ROMCHECK_XML")
	if path == "" {
		t.Skip("set ROMCHECK_XML to the mame2003-plus game list")
	}
	f, err := os.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	cat, err := ParseXML(f)
	if err != nil {
		t.Fatal(err)
	}
	if len(cat.Games) < 5000 || cat.Game("1941") == nil || !cat.Game("neogeo").BIOS {
		t.Fatalf("unexpected list: %d games", len(cat.Games))
	}
}

func TestChipsSomeCoresDoNotSaveAreRequiredInTheSave(t *testing.T) {
	cat, err := ParseXML(strings.NewReader(`<mame>
	<game name="simpsons"><description>The Simpsons</description><chip type="cpu" name="KONAMI"/><chip type="cpu" name="Z80"/></game>
	<game name="xmvsf"><description>X-Men Vs. Street Fighter</description><chip type="cpu" name="68000"/><chip type="audio" name="QSound"/></game>
	<game name="cabal"><description>Cabal</description><chip type="cpu" name="68000"/><chip type="audio" name="YM2151"/></game>
	</mame>`))
	if err != nil {
		t.Fatal(err)
	}
	for name, want := range map[string]string{"simpsons": "konami", "xmvsf": "QSound", "cabal": ""} {
		if got := strings.Join(cat.Games[name].SaveModules, ","); got != want {
			t.Errorf("%s: SaveModules = %q, want %q", name, got, want)
		}
	}
}
