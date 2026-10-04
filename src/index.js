import app from "./app.js";
import connectDB from "./db/index.js";

const port = process.env.PORT || 3000;

if (!process.env.VERCEL) {
  connectDB()
    .then(() => {
      console.log("MongoDB connected");
      app.listen(port, () => {
        console.log(`API listening on http://localhost:${port}`);
      });
    })
    .catch((err) => {
      console.error("MongoDB connection error", err);
      process.exit(1);
    });
}

export default app;
