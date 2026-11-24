import 'dotenv/config';
import { app } from './app.js';
import { assertBootConfig } from './config.js';
import { syncDatabase } from './db/index.js';

assertBootConfig();

await syncDatabase();

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
