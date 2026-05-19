import express from 'express';

const app = express();

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'parse' });
});

const port = Number(process.env.PORT ?? 4001);

if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`[parse] listening on :${port}`);
  });
}

export { app };
