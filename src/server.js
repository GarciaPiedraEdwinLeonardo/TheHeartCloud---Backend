import app from "./app.js";
import { config } from "./config/environment.js";

const PORT = config.port;

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📝 Entorno: ${config.nodeEnv}`);
});
