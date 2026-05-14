const app = require("./src/app");
const { DOWNLOAD_DIR } = require("./src/utils/helpers");

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`   YouTube Downloader API`);
  console.log(`========================================`);
  console.log(`Server running at: http://localhost:${PORT}`);
  console.log(`Downloads folder : ${DOWNLOAD_DIR}\n`);
  console.log(`API Endpoints:`);
  console.log(`  GET  /api/video/info?url=...`);
  console.log(`  GET  /api/video/qualities`);
  console.log(`  GET  /api/video/download-sse?url=...&quality=...`);
  console.log(`  GET  /api/video/file/:filename`);
  console.log(`  GET  /api/health\n`);
});

