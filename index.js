require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mariadb = require('mariadb');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 5
});

// Endpoint untuk root URL
app.get('/', (req, res) => {
  res.send('Halo! Ini adalah Backend API untuk Desa Buniara.');
});

// ==========================================
// ROUTES (API ENDPOINTS)
// ==========================================

// 1. MENGAMBIL data konten web
app.get('/api/konten', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query("SELECT * FROM konten_web WHERE id = 1");
    
    if (rows.length > 0) {
      res.status(200).json({ success: true, data: rows[0] });
    } else {
      res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Gagal mengambil data" });
  } finally {
    if (conn) conn.release();
  }
});

// 2. MENGUBAH data konten web
app.put('/api/konten', async (req, res) => {
  let conn;
  try {
    const { hero_headline, hero_subheadline, tentang_judul, tentang_desc1, tentang_desc2, dusun } = req.body;
    conn = await pool.getConnection();
    
    await conn.query(
      `UPDATE konten_web SET 
        hero_headline = ?, hero_subheadline = ?, tentang_judul = ?, tentang_desc1 = ?, tentang_desc2 = ?, dusun = ? 
      WHERE id = 1`,
      [hero_headline, hero_subheadline, tentang_judul, tentang_desc1, tentang_desc2, JSON.stringify(dusun)]
    );

    res.status(200).json({ success: true, message: "Data konten web berhasil diperbarui!" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Gagal menyimpan data" });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/login', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { email, password } = req.body;

    // 1. PASTIKAN kolom is_aktif ikut di-select dari database
    const rows = await conn.query(
      "SELECT id, nama, email, role, password, is_aktif FROM pengguna WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Email atau kata sandi salah" });
    }

    const user = rows[0];

    // 2. BLOKIR DISINI JIKA AKUN NONAKTIF
    const isAktif = user.is_aktif === 1 || user.is_aktif === true;
    if (!isAktif) {
      return res.status(403).json({ 
        success: false, 
        message: "Akses Ditolak: Akun Anda telah dinonaktifkan oleh Super Admin." 
      });
    }

    // 3. Lanjutkan cek password jika akun aktif
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ success: false, message: "Email atau kata sandi salah" });
    }

    delete user.password;

    const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1d' });

    res.json({ success: true, token, user });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server" });
  } finally {
    if (conn) conn.release();
  }
});

// ==========================================
// API MANAJEMEN PENGGUNA
// ==========================================

// A. MENGAMBIL semua data pengguna
app.get('/api/pengguna', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query("SELECT id, nama, email, role, is_aktif FROM pengguna ORDER BY id DESC");
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Gagal mengambil data pengguna" });
  } finally {
    if (conn) conn.release();
  }
});

// B. MENAMBAH pengguna baru
app.post('/api/pengguna', async (req, res) => {
  let conn;
  try {
    const { nama, email, password, role } = req.body;
    
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    
    conn = await pool.getConnection();
    await conn.query(
      "INSERT INTO pengguna (nama, email, password, role) VALUES (?, ?, ?, ?)",
      [nama, email, hashedPassword, role || 'Administrator']
    );
    
    res.status(201).json({ success: true, message: "Pengguna berhasil ditambahkan" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Gagal menambah pengguna (mungkin email sudah terdaftar)" });
  } finally {
    if (conn) conn.release();
  }
});

// C. MENGUBAH status aktif pengguna (Toggle)
app.put('/api/pengguna/:id/status', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { is_aktif } = req.body;
    
    conn = await pool.getConnection();
    await conn.query("UPDATE pengguna SET is_aktif = ? WHERE id = ?", [is_aktif, id]);
    
    res.status(200).json({ success: true, message: "Status pengguna berhasil diperbarui" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Gagal memperbarui status" });
  } finally {
    if (conn) conn.release();
  }
});

// D. MENGHAPUS pengguna
app.delete('/api/pengguna/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    
    conn = await pool.getConnection();
    await conn.query("DELETE FROM pengguna WHERE id = ?", [id]);
    
    res.status(200).json({ success: true, message: "Pengguna berhasil dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Gagal menghapus pengguna" });
  } finally {
    if (conn) conn.release();
  }
});

// E. MENGEDIT data pengguna (Nama, Email, Role, Password opsional)
app.put('/api/pengguna/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { nama, email, role, password } = req.body;
    
    conn = await pool.getConnection();

    if (password && password.trim() !== '') {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      await conn.query(
        "UPDATE pengguna SET nama = ?, email = ?, role = ?, password = ? WHERE id = ?",
        [nama, email, role, hashedPassword, id]
      );
    } else {
      await conn.query(
        "UPDATE pengguna SET nama = ?, email = ?, role = ? WHERE id = ?",
        [nama, email, role, id]
      );
    }
    
    res.status(200).json({ success: true, message: "Data pengguna berhasil diperbarui" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Gagal memperbarui pengguna" });
  } finally {
    if (conn) conn.release();
  }
});

app.listen(PORT, () => {
  console.log(`Server backend berjalan di http://localhost:${PORT}`);
});