import app from './app';

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`Sprout backend listening on http://localhost:${PORT} (Firestore)`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
});
