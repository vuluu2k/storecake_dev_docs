---
sidebar_position: 5
title: Errors
---

# Errors

Known issues and quick fixes for **builderx_api**.

## "Publish" or "Save" fails in the builder

**Symptom** — Publishing or saving from the builder UI returns a 500 and the logs show a file-system error writing CSS assets.

**Cause** — The `priv/static/css` directory does not exist in the container.

**Fix** — Create the directory and retry:

```bash
mkdir -p priv/static/css
```

If you are running inside Docker, do this from `make bash` so the path is created in the container's volume.
