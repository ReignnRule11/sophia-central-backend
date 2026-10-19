I added an ai-scanner package + Dockerfile to support the ClamAV-enabled scanner worker.

Notes:
- The Dockerfile assumes your repo build process produces compiled JS into dist/libs/storage/scanner.
  If you prefer building inside the container, change the Dockerfile to copy TypeScript sources and run `npm run build`.
- package.json includes clamdjs as a dependency; pin versions as needed.
- After pushing, run a full repo build to ensure dist/ files are present before starting the ai-scanner container.
