import { Router } from 'express';
import db from '../db.js';

const router = Router();

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== process.env.ADMIN_TOKEN) return res.status(401).json({ ok: false });
  next();
}

router.get('/tickets', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM tickets ORDER BY created_at DESC').all();
  res.json({ ok: true, tickets: rows });
});

router.post('/tickets/:id/cancel', auth, (req, res) => {
  const { id } = req.params;
  db.prepare("UPDATE tickets SET status='cancelled' WHERE id = ?").run(id);
  const row = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
  res.json({ ok: true, ticket: row });
});

export default router;
