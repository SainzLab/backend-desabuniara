require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mariadb = require('mariadb');
const bcrypt = require('bcryptjs'); 
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = mariadb.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  connectionLimit: 5
});

// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: "Akses Ditolak: Token tidak ditemukan" });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ success: false, message: "Akses Ditolak: Token tidak valid atau kadaluarsa" });
  }
};


// ==========================================
// 1. PUBLIC ROUTES (Tanpa Token)
// ==========================================

// A. Root URL
app.get('/', (req, res) => {
  res.send('Halo! Ini adalah Backend API untuk Desa Buniara.');
});

// B. Login Admin
app.post('/api/login', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const { email, password } = req.body;

    const rows = await conn.query(
      "SELECT id, nama, email, role, password, is_aktif FROM pengguna WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ success: false, message: "Email atau kata sandi salah" });
    }

    const user = rows[0];
    const isAktif = user.is_aktif === 1 || user.is_aktif === true;
    
    if (!isAktif) {
      return res.status(403).json({ 
        success: false, 
        message: "Akses Ditolak: Akun Anda telah dinonaktifkan oleh Super Admin." 
      });
    }

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

// C. MENGAMBIL DATA KONTEN WEB (Bisa diakses publik untuk frontend web desa)
app.get('/api/konten', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query("SELECT * FROM konten_web WHERE id = 1");
    
    if (rows.length > 0) {
      const data = rows[0];
      
      // Fungsi aman untuk parsing JSON dari database
      const parseJSON = (str, fallback) => {
        if (!str) return fallback; 
        try {
          const parsed = typeof str === 'string' ? JSON.parse(str) : str;
          return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } catch (e) {
          console.error("Gagal parse JSON:", str);
          return fallback;
        }
      };

      data.dusun = parseJSON(data.dusun, []);
      data.perangkat_desa = parseJSON(data.perangkat_desa, []);
      
      // Pastikan nilai NULL dari database diubah menjadi string kosong untuk form
      Object.keys(data).forEach(key => {
        if (data[key] === null) {
          data[key] = '';
        }
      });

      res.status(200).json({ success: true, data: data });
    } else {
      res.status(404).json({ success: false, message: "Data tidak ditemukan" });
    }
  } catch (err) {
    console.error("Error GET Konten:", err);
    res.status(500).json({ success: false, message: "Gagal mengambil data konten" });
  } finally {
    if (conn) conn.release();
  }
});


// ==========================================
// 2. PROTECTED ROUTES (Wajib Login / Token)
// ==========================================

// A. MENGUPDATE DATA KONTEN WEB
app.put('/api/konten', verifyToken, async (req, res) => {
  let conn;
  try {
    const {
      hero_headline, hero_subheadline, hero_image,
      tentang_judul, tentang_desc1, tentang_desc2, tentang_img1, tentang_img2,
      dusun, maps_embed, kantor_img, alamat, jam_operasional, layanan, kontak, perangkat_desa
    } = req.body;

    const dusunJSON = JSON.stringify(Array.isArray(dusun) ? dusun : []);
    const perangkatDesaJSON = JSON.stringify(Array.isArray(perangkat_desa) ? perangkat_desa : []);

    conn = await pool.getConnection();
    
    const query = `
      UPDATE konten_web 
      SET 
        hero_headline = ?, hero_subheadline = ?, hero_image = ?,
        tentang_judul = ?, tentang_desc1 = ?, tentang_desc2 = ?, tentang_img1 = ?, tentang_img2 = ?,
        dusun = ?, maps_embed = ?, kantor_img = ?, alamat = ?, 
        jam_operasional = ?, layanan = ?, kontak = ?, perangkat_desa = ?
      WHERE id = 1
    `;

    const values = [
      hero_headline || '', hero_subheadline || '', hero_image || '',
      tentang_judul || '', tentang_desc1 || '', tentang_desc2 || '', tentang_img1 || '', tentang_img2 || '',
      dusunJSON, maps_embed || '', kantor_img || '', alamat || '', 
      jam_operasional || '', layanan || '', kontak || '', perangkatDesaJSON
    ];

    const result = await conn.query(query, values);

    if (result.affectedRows > 0) {
      res.status(200).json({ success: true, message: "Data konten web berhasil diperbarui!" });
    } else {
      res.status(400).json({ success: false, message: "Gagal memperbarui data" });
    }
  } catch (err) {
    console.error("Error PUT Konten:", err);
    res.status(500).json({ success: false, message: "Terjadi kesalahan pada server saat menyimpan" });
  } finally {
    if (conn) conn.release();
  }
});

// B. Manajemen Pengguna: Ambil Semua Data
app.get('/api/pengguna', verifyToken, async (req, res) => {
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

// C. Manajemen Pengguna: Tambah Baru
app.post('/api/pengguna', verifyToken, async (req, res) => {
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

// D. Manajemen Pengguna: Edit Data
app.put('/api/pengguna/:id', verifyToken, async (req, res) => {
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

// E. Manajemen Pengguna: Ubah Status Aktif (Toggle)
app.put('/api/pengguna/:id/status', verifyToken, async (req, res) => {
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

// F. Manajemen Pengguna: Hapus
app.delete('/api/pengguna/:id', verifyToken, async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`Server backend berjalan di http://localhost:${PORT}`);
});