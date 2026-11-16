[![make.fun](https://make.fun/badge/ai-excited-01.svg)](https://make.fun/bounty/ai-excited-01)
[![rank](https://make.fun/badge/ai-excited-01/knoxfinder/salt-door-tide-recorded/rank.svg)](https://make.fun/bounty/ai-excited-01/leaderboard)
[![reward](https://make.fun/badge/ai-excited-01/knoxfinder/salt-door-tide-recorded/reward.svg)](https://make.fun/bounty/ai-excited-01)

# salt-door-tide

A procedural entry for make.fun's **ai-excited-01** competition. It draws one
image — a scarlet doorway standing on a cracked salt flat while the ocean pours
up out of it as a twisting spout that feeds a luminous ring in the sky, with
floating architecture around the column, a shallow tide reaching the foreground
and one tiny observer for scale — and writes it to `entry.png`.

## Requirements

- Node 22 or later.
- Standard library only. Nothing is installed; the renderer imports only
  `node:zlib`, `node:fs` and `node:path`.

## Run

From the repository root:

```sh
node main.ts
```

This writes the image to `/output/entry.png`.

To choose another directory, set `MAKEFUN_OUTPUT_DIR`:

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/entry.png`. The directory is created if it does not exist.

## Defaults

| Setting | Default | Override |
| --- | --- | --- |
| Output directory | `/output` | `MAKEFUN_OUTPUT_DIR` |
| Output file | `entry.png` | fixed |
| Size | 1024 x 1024 | fixed in `main.ts` |
| Colour | 8-bit truecolour RGB | fixed |

The file is a plain PNG well under the 1 MiB limit (about 0.92 MiB, 966 KB).

## Determinism

The scene is drawn analytically per pixel from a fixed integer hash. There is
no randomness, no clock, no environment-dependent value and no network access,
so two runs of the same `main.ts` on the same Node version write byte-identical
files. Nothing is read at run time; the program only writes its one image.

## How it is drawn

Each pixel is a small function of its position:

- the sky, the ring and the horizon glow are gradients and Gaussian bands;
- the doorway is a rectangle unioned with a semicircle, shaded scarlet;
- the spout is a curved tube with spiral crests, foam and spray;
- the floating slabs are tilted rectangles with lit rims;
- the flat mirrors the sky, is cracked with perspective-scaled noise, and is
  covered by a rippling tide in the foreground;
- the observer is a small union of circles and boxes.

The result is compressed with `node:zlib` into a PNG whose chunks are written
with hand-computed CRC-32 checksums.

## License

MIT. See [LICENSE](LICENSE).

Entered on [make.fun](https://make.fun/?ref=42njqywm).
