const app = require("./src/app");
const { DOWNLOAD_DIR } = require("./src/utils/helpers");

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n========================================`);
  console.log(`   YouTube Downloader API`);
  console.log(`========================================`);
  console.log(`Server running at: http://localhost:${PORT}`);
});
