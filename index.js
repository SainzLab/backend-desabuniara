require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mariadb = require('mariadb');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

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
// KONFIGURASI MULTER (PENYIMPANAN GAMBAR FISIK)
// ==========================================
// Pastikan folder public/uploads/ ada. Jika belum, buat secara otomatis.
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir); // Folder tujuan penyimpanan gambar
  },
  filename: function (req, file, cb) {
    // Generate nama file unik: timestamp + angka random + ekstensi asli
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(
      null,
      file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname)
    );
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // Batasi ukuran file max 5MB agar aman
});

// ==========================================
// HELPER: HAPUS FILE FISIK DARI SERVER
// ==========================================
const hapusFileFisik = (relativePath) => {
  if (!relativePath || relativePath.trim() === '') return;

  // Ubah path dari /uploads/xxx.jpg menjadi letak absolut di direktori
  const cleanPath = relativePath.startsWith('/')
    ? relativePath.slice(1)
    : relativePath;
  const absolutePath = path.join(__dirname, 'public', cleanPath);

  fs.access(absolutePath, fs.constants.F_OK, (err) => {
    if (!err) {
      fs.unlink(absolutePath, (errUnlink) => {
        if (errUnlink) {
          console.error(
            `[Gagal] Hapus file fisik: ${absolutePath}`,
            errUnlink
          );
        } else {
          console.log(`[Berhasil] Hapus file fisik: ${absolutePath}`);
        }
      });
    }
  });
};

// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// MENYAJIKAN FOLDER PUBLIC AGAR BISA DIAKSES FRONTEND/BROWSER
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res
      .status(401)
      .json({ success: false, message: 'Akses Ditolak: Token tidak ditemukan' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      message: 'Akses Ditolak: Token tidak valid atau kadaluarsa'
    });
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
      'SELECT id, nama, email, role, password, is_aktif FROM pengguna WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res
        .status(401)
        .json({ success: false, message: 'Email atau kata sandi salah' });
    }

    const user = rows[0];
    const isAktif = user.is_aktif === 1 || user.is_aktif === true;

    if (!isAktif) {
      return res.status(403).json({
        success: false,
        message:
          'Akses Ditolak: Akun Anda telah dinonaktifkan oleh Super Admin.'
      });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res
        .status(401)
        .json({ success: false, message: 'Email atau kata sandi salah' });
    }

    delete user.password;
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({ success: true, token, user });
  } catch (error) {
    console.error('Login error:', error);
    res
      .status(500)
      .json({ success: false, message: 'Terjadi kesalahan pada server' });
  } finally {
    if (conn) conn.release();
  }
});

// C. MENGAMBIL DATA KONTEN WEB (Bisa diakses publik untuk frontend web desa)
app.get('/api/konten', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM konten_web WHERE id = 1');

    if (rows.length > 0) {
      const data = rows[0];
      const parseJSON = (str, fallback) => {
        if (!str) return fallback;
        try {
          const parsed = typeof str === 'string' ? JSON.parse(str) : str;
          return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        } catch (e) {
          console.error('Gagal parse JSON:', str);
          return fallback;
        }
      };

      data.dusun = parseJSON(data.dusun, []);
      data.perangkat_desa = parseJSON(data.perangkat_desa, []);

      Object.keys(data).forEach((key) => {
        if (data[key] === null) {
          data[key] = '';
        }
      });

      res.status(200).json({ success: true, data: data });
    } else {
      res.status(404).json({ success: false, message: 'Data tidak ditemukan' });
    }
  } catch (err) {
    console.error('Error GET Konten:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal mengambil data konten' });
  } finally {
    if (conn) conn.release();
  }
});

// ==========================================
// 2. PROTECTED ROUTES (Wajib Login / Token)
// ==========================================
const uploadFields = upload.fields([
  { name: 'hero_image', maxCount: 1 },
  { name: 'tentang_img1', maxCount: 1 },
  { name: 'tentang_img2', maxCount: 1 },
  { name: 'kantor_img', maxCount: 1 }
]);

// MENGUPDATE DATA KONTEN WEB (Sudah termasuk Email & Logging)
app.put('/api/konten', verifyToken, uploadFields, async (req, res) => {
  let conn;
  try {
    const {
      hero_headline,
      hero_subheadline,
      tentang_judul,
      tentang_desc1,
      tentang_desc2,
      dusun,
      maps_embed,
      alamat,
      jam_operasional,
      layanan,
      kontak,
      email,
      perangkat_desa
    } = req.body;

    const hero_image =
      req.files && req.files['hero_image']
        ? '/uploads/' + req.files['hero_image'][0].filename
        : req.body.hero_image;
    const tentang_img1 =
      req.files && req.files['tentang_img1']
        ? '/uploads/' + req.files['tentang_img1'][0].filename
        : req.body.tentang_img1;
    const tentang_img2 =
      req.files && req.files['tentang_img2']
        ? '/uploads/' + req.files['tentang_img2'][0].filename
        : req.body.tentang_img2;
    const kantor_img =
      req.files && req.files['kantor_img']
        ? '/uploads/' + req.files['kantor_img'][0].filename
        : req.body.kantor_img;

    const dusunJSON = JSON.stringify(
      Array.isArray(dusun)
        ? dusun
        : typeof dusun === 'string'
        ? JSON.parse(dusun || '[]')
        : []
    );
    const perangkatDesaJSON = JSON.stringify(
      Array.isArray(perangkat_desa)
        ? perangkat_desa
        : typeof perangkat_desa === 'string'
        ? JSON.parse(perangkat_desa || '[]')
        : []
    );

    conn = await pool.getConnection();
    const query = `
      UPDATE konten_web
      SET
        hero_headline = ?,
        hero_subheadline = ?,
        hero_image = ?,
        tentang_judul = ?,
        tentang_desc1 = ?,
        tentang_desc2 = ?,
        tentang_img1 = ?,
        tentang_img2 = ?,
        dusun = ?,
        maps_embed = ?,
        kantor_img = ?,
        alamat = ?,
        jam_operasional = ?,
        layanan = ?,
        kontak = ?,
        email = ?,
        perangkat_desa = ?
      WHERE id = 1
    `;
    const values = [
      hero_headline || '',
      hero_subheadline || '',
      hero_image || '',
      tentang_judul || '',
      tentang_desc1 || '',
      tentang_desc2 || '',
      tentang_img1 || '',
      tentang_img2 || '',
      dusunJSON,
      maps_embed || '',
      kantor_img || '',
      alamat || '',
      jam_operasional || '',
      layanan || '',
      kontak || '',
      email || '',
      perangkatDesaJSON
    ];

    const result = await conn.query(query, values);

    if (result.affectedRows > 0) {
      res.status(200).json({
        success: true,
        message: 'Data konten web berhasil diperbarui!'
      });
    } else {
      res
        .status(400)
        .json({ success: false, message: 'Gagal memperbarui data' });
    }
  } catch (err) {
    console.error('Error PUT Konten:', err);
    res.status(500).json({
      success: false,
      message: 'Terjadi kesalahan pada server saat menyimpan'
    });
  } finally {
    if (conn) conn.release();
  }
});

// ==========================================
// 3. ROUTE SOSIAL MEDIA (GET, POST, DELETE)
// ==========================================
// GET: Ambil semua data sosial media
app.get('/api/sosmed', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM sosial_media ORDER BY id DESC');
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('Error GET Sosmed:', err);
    res.status(500).json({
      success: false,
      message: 'Gagal mengambil data sosial media'
    });
  } finally {
    if (conn) conn.release();
  }
});

// POST: Tambah link sosial media baru
app.post('/api/sosmed', verifyToken, async (req, res) => {
  let conn;
  try {
    const { platform, url } = req.body;
    if (!platform || !url) {
      return res
        .status(400)
        .json({ success: false, message: 'Platform dan URL wajib diisi' });
    }
    conn = await pool.getConnection();
    const result = await conn.query(
      'INSERT INTO sosial_media (platform, url) VALUES (?, ?)',
      [platform, url]
    );
    res.status(201).json({
      success: true,
      message: 'Sosial media berhasil ditambahkan',
      data: { id: Number(result.insertId), platform, url }
    });
  } catch (err) {
    console.error('Error POST Sosmed:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal menyimpan sosial media' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE: Hapus link sosial media berdasarkan ID
app.delete('/api/sosmed/:id', verifyToken, async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    const result = await conn.query('DELETE FROM sosial_media WHERE id = ?', [
      id
    ]);
    if (result.affectedRows > 0) {
      res
        .status(200)
        .json({ success: true, message: 'Sosial media berhasil dihapus' });
    } else {
      res
        .status(404)
        .json({ success: false, message: 'Data sosial media tidak ditemukan' });
    }
  } catch (err) {
    console.error('Error DELETE Sosmed:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal menghapus sosial media' });
  } finally {
    if (conn) conn.release();
  }
});

// ==========================================
// 4. MANAJEMEN PENGGUNA
// ==========================================
app.get('/api/pengguna', verifyToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT id, nama, email, role, is_aktif FROM pengguna ORDER BY id DESC'
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: 'Gagal mengambil data pengguna' });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/api/pengguna', verifyToken, async (req, res) => {
  let conn;
  try {
    const { nama, email, password, role } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    conn = await pool.getConnection();
    await conn.query(
      'INSERT INTO pengguna (nama, email, password, role) VALUES (?, ?, ?, ?)',
      [nama, email, hashedPassword, role || 'Administrator']
    );
    res
      .status(201)
      .json({ success: true, message: 'Pengguna berhasil ditambahkan' });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Gagal menambah pengguna (mungkin email sudah terdaftar)'
    });
  } finally {
    if (conn) conn.release();
  }
});

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
        'UPDATE pengguna SET nama = ?, email = ?, role = ?, password = ? WHERE id = ?',
        [nama, email, role, hashedPassword, id]
      );
    } else {
      await conn.query(
        'UPDATE pengguna SET nama = ?, email = ?, role = ? WHERE id = ?',
        [nama, email, role, id]
      );
    }
    res
      .status(200)
      .json({ success: true, message: 'Data pengguna berhasil diperbarui' });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: 'Gagal memperbarui pengguna' });
  } finally {
    if (conn) conn.release();
  }
});

app.put('/api/pengguna/:id/status', verifyToken, async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { is_aktif } = req.body;
    conn = await pool.getConnection();
    await conn.query('UPDATE pengguna SET is_aktif = ? WHERE id = ?', [
      is_aktif,
      id
    ]);
    res
      .status(200)
      .json({ success: true, message: 'Status pengguna berhasil diperbarui' });
  } catch (err) {
    res
      .status(500)
      .json({ success: false, message: 'Gagal memperbarui status' });
  } finally {
    if (conn) conn.release();
  }
});

app.delete('/api/pengguna/:id', verifyToken, async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    await conn.query('DELETE FROM pengguna WHERE id = ?', [id]);
    res.status(200).json({ success: true, message: 'Pengguna berhasil dihapus' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Gagal menghapus pengguna' });
  } finally {
    if (conn) conn.release();
  }
});

// ==========================================
// API UNTUK MANAJEMEN WISATA (DENGAN HAPUS FILE FISIK)
// ==========================================
const uploadWisata = upload.fields([
  { name: 'image', maxCount: 1 }, // Foto Katalog Depan (Thumbnail)
  { name: 'gambar_hero', maxCount: 1 }, // Gambar Banner Hero Detail
  { name: 'galeri_1', maxCount: 1 }, // Galeri 1
  { name: 'galeri_2', maxCount: 1 }, // Galeri 2
  { name: 'galeri_3', maxCount: 1 }, // Galeri 3
  { name: 'galeri_4', maxCount: 1 } // Galeri 4
]);

// GET: Semua data wisata (Untuk halaman admin)
app.get('/api/wisata', verifyToken, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM wisata ORDER BY id DESC');
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('Error GET wisata admin:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal mengambil data wisata' });
  } finally {
    if (conn) conn.release();
  }
});

// POST: Tambah Wisata Baru
app.post('/api/wisata', verifyToken, uploadWisata, async (req, res) => {
  let conn;
  try {
    const {
      judul,
      kategori,
      deskripsi,
      tentang,
      fasilitas,
      peta_url,
      isPublished
    } = req.body;
    const is_published =
      isPublished === 'true' || isPublished === true || isPublished == 1
        ? 1
        : 0;

    const imagePath =
      req.files && req.files['image']
        ? '/uploads/' + req.files['image'][0].filename
        : '';
    const gambarHero =
      req.files && req.files['gambar_hero']
        ? '/uploads/' + req.files['gambar_hero'][0].filename
        : '';
    const g1 =
      req.files && req.files['galeri_1']
        ? '/uploads/' + req.files['galeri_1'][0].filename
        : '';
    const g2 =
      req.files && req.files['galeri_2']
        ? '/uploads/' + req.files['galeri_2'][0].filename
        : '';
    const g3 =
      req.files && req.files['galeri_3']
        ? '/uploads/' + req.files['galeri_3'][0].filename
        : '';
    const g4 =
      req.files && req.files['galeri_4']
        ? '/uploads/' + req.files['galeri_4'][0].filename
        : '';

    const fasilitasJSON = JSON.stringify(
      Array.isArray(fasilitas)
        ? fasilitas
        : typeof fasilitas === 'string'
        ? JSON.parse(fasilitas || '[]')
        : []
    );

    conn = await pool.getConnection();
    const result = await conn.query(
      'INSERT INTO wisata (judul, kategori, deskripsi, tentang, fasilitas, peta_url, image, gambar_hero, galeri_1, galeri_2, galeri_3, galeri_4, is_published) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        judul,
        kategori,
        deskripsi,
        tentang || '',
        fasilitasJSON,
        peta_url || '',
        imagePath,
        gambarHero,
        g1,
        g2,
        g3,
        g4,
        is_published
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Data wisata berhasil ditambahkan',
      id: Number(result.insertId)
    });
  } catch (err) {
    console.error('Error menambah wisata:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal menyimpan data wisata' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT: Edit Wisata (DILENGKAPI PEMBERSIHAN FOTO LAMA OTOMATIS)
app.put('/api/wisata/:id', verifyToken, uploadWisata, async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { judul, kategori, deskripsi, tentang, fasilitas, peta_url } =
      req.body;

    conn = await pool.getConnection();

    // 1. Ambil Data Lama
    const rows = await conn.query(
      'SELECT image, gambar_hero, galeri_1, galeri_2, galeri_3, galeri_4 FROM wisata WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Data wisata tidak ditemukan' });
    }
    const dataLama = rows[0];

    // 2. Resolve Path Gambar Baru atau Pertahankan yang Lama
    const imagePath =
      req.files && req.files['image']
        ? '/uploads/' + req.files['image'][0].filename
        : req.body.image;
    const gambarHero =
      req.files && req.files['gambar_hero']
        ? '/uploads/' + req.files['gambar_hero'][0].filename
        : req.body.gambar_hero;
    const g1 =
      req.files && req.files['galeri_1']
        ? '/uploads/' + req.files['galeri_1'][0].filename
        : req.body.galeri_1;
    const g2 =
      req.files && req.files['galeri_2']
        ? '/uploads/' + req.files['galeri_2'][0].filename
        : req.body.galeri_2;
    const g3 =
      req.files && req.files['galeri_3']
        ? '/uploads/' + req.files['galeri_3'][0].filename
        : req.body.galeri_3;
    const g4 =
      req.files && req.files['galeri_4']
        ? '/uploads/' + req.files['galeri_4'][0].filename
        : req.body.galeri_4;

    const fasilitasJSON = JSON.stringify(
      Array.isArray(fasilitas)
        ? fasilitas
        : typeof fasilitas === 'string'
        ? JSON.parse(fasilitas || '[]')
        : []
    );

    // 3. Update Database
    await conn.query(
      'UPDATE wisata SET judul = ?, kategori = ?, deskripsi = ?, tentang = ?, fasilitas = ?, peta_url = ?, image = ?, gambar_hero = ?, galeri_1 = ?, galeri_2 = ?, galeri_3 = ?, galeri_4 = ? WHERE id = ?',
      [
        judul,
        kategori,
        deskripsi,
        tentang || '',
        fasilitasJSON,
        peta_url || '',
        imagePath,
        gambarHero,
        g1,
        g2,
        g3,
        g4,
        id
      ]
    );

    // 4. Bersihkan File Fisik (Jika diunggah file baru atau jika sengaja dihapus)
    const cekDanHapus = (fieldName, pathBaru, pathLama) => {
      const adaUnggahanBaru = req.files && req.files[fieldName];
      const userHapusManual = pathBaru === '' && pathLama && pathLama !== '';

      if (adaUnggahanBaru || userHapusManual) {
        if (pathLama) hapusFileFisik(pathLama);
      }
    };

    cekDanHapus('image', imagePath, dataLama.image);
    cekDanHapus('gambar_hero', gambarHero, dataLama.gambar_hero);
    cekDanHapus('galeri_1', g1, dataLama.galeri_1);
    cekDanHapus('galeri_2', g2, dataLama.galeri_2);
    cekDanHapus('galeri_3', g3, dataLama.galeri_3);
    cekDanHapus('galeri_4', g4, dataLama.galeri_4);

    res
      .status(200)
      .json({ success: true, message: 'Data wisata berhasil diupdate' });
  } catch (err) {
    console.error('Error update wisata:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal mengupdate data wisata' });
  } finally {
    if (conn) conn.release();
  }
});

// PUT: Toggle Status Publish
app.put('/api/wisata/:id/status', verifyToken, async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const { is_published } = req.body;
    conn = await pool.getConnection();
    await conn.query('UPDATE wisata SET is_published = ? WHERE id = ?', [
      is_published,
      id
    ]);
    res
      .status(200)
      .json({ success: true, message: 'Status wisata berhasil diperbarui' });
  } catch (err) {
    console.error('Error update status wisata:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal merubah status wisata' });
  } finally {
    if (conn) conn.release();
  }
});

// DELETE: Hapus Wisata (DILENGKAPI PEMBERSIHAN FOTO SECARA KESELURUHAN)
app.delete('/api/wisata/:id', verifyToken, async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();

    // 1. Ambil data wisata sebelum dihapus dari DB
    const rows = await conn.query(
      'SELECT image, gambar_hero, galeri_1, galeri_2, galeri_3, galeri_4 FROM wisata WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Data wisata tidak ditemukan' });
    }
    const dataLama = rows[0];

    // 2. Hapus Data dari Database
    await conn.query('DELETE FROM wisata WHERE id = ?', [id]);

    // 3. Hapus Seluruh File Gambar Fisik
    const fieldGambar = [
      'image',
      'gambar_hero',
      'galeri_1',
      'galeri_2',
      'galeri_3',
      'galeri_4'
    ];
    fieldGambar.forEach((field) => {
      if (dataLama[field]) {
        hapusFileFisik(dataLama[field]);
      }
    });

    res
      .status(200)
      .json({ success: true, message: 'Data wisata berhasil dihapus' });
  } catch (err) {
    console.error('Error delete wisata:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal menghapus data wisata' });
  } finally {
    if (conn) conn.release();
  }
});

// GET: Data Publik untuk Landing Page
app.get('/api/public/wisata', async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT * FROM wisata WHERE is_published = 1 ORDER BY id DESC'
    );
    res.status(200).json({ success: true, data: rows });
  } catch (err) {
    console.error('Error GET public wisata:', err);
    res
      .status(500)
      .json({ success: false, message: 'Gagal mengambil data' });
  } finally {
    if (conn) conn.release();
  }
});

// GET: Detail Wisata
app.get('/api/wisata/:id', async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM wisata WHERE id = ?', [id]);

    if (rows.length > 0) {
      const data = rows[0];
      if (data.fasilitas) {
        try {
          data.fasilitas =
            typeof data.fasilitas === 'string'
              ? JSON.parse(data.fasilitas)
              : data.fasilitas;
        } catch (e) {
          data.fasilitas = [];
        }
      } else {
        data.fasilitas = [];
      }
      res.status(200).json({ success: true, data: data });
    } else {
      res
        .status(404)
        .json({ success: false, message: 'Data tidak ditemukan di database' });
    }
  } catch (err) {
    console.error('Error Detail API Wisata:', err);
    res.status(500).json({ success: false, message: 'Terjadi kesalahan server' });
  } finally {
    if (conn) conn.release();
  }
});

// ==========================================
// API MANAJEMEN UMKM (DENGAN HAPUS FILE FISIK)
// ==========================================
const uploadUmkm = upload.fields([
  { name: 'image', maxCount: 1 }, // Thumbnail utama
  { name: 'gambar_hero', maxCount: 1 }, // Banner atas halaman detail
  { name: 'galeri1', maxCount: 1 },
  { name: 'galeri2', maxCount: 1 },
  { name: 'galeri3', maxCount: 1 },
  { name: 'galeri4', maxCount: 1 }
]);

const getPath = (req, fieldName, fallback = '') => {
  if (req.files && req.files[fieldName]) {
    return '/uploads/' + req.files[fieldName][0].filename;
  }
  return req.body[fieldName] !== undefined ? req.body[fieldName] : fallback;
};

// 1. GET SEMUA UMKM (Untuk Admin)
app.get('/api/umkm', verifyToken, async (req, res) => {
  try {
    const rows = await pool.query('SELECT * FROM umkm ORDER BY id DESC');
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 2. GET DETAIL UMKM BY ID (Untuk Admin / Detail Tanpa Filter Publish)
app.get('/api/umkm/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await pool.query('SELECT * FROM umkm WHERE id = ?', [id]);
    if (rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: 'Data UMKM tidak ditemukan' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 3. POST TAMBAH UMKM BARU
app.post('/api/umkm', verifyToken, uploadUmkm, async (req, res) => {
  try {
    const {
      judul,
      nama_umkm,
      pemilik,
      kategori,
      deskripsi_singkat,
      deskripsi,
      tentang,
      peta_url,
      no_wa,
      url_youtube,
      url_instagram,
      url_tiktok,
      is_published
    } = req.body;
    const nama = nama_umkm || judul || '';
    const statusPublish =
      is_published === 'true' || is_published === true || is_published == 1
        ? 1
        : 0;

    const imagePath = getPath(req, 'image', '');
    const gambarHeroPath = getPath(req, 'gambar_hero', imagePath);
    const g1 = getPath(req, 'galeri1', '');
    const g2 = getPath(req, 'galeri2', '');
    const g3 = getPath(req, 'galeri3', '');
    const g4 = getPath(req, 'galeri4', '');

    const query = `
      INSERT INTO umkm (
        nama_umkm, pemilik, kategori, deskripsi_singkat, deskripsi, tentang, 
        peta_url, no_wa, url_youtube, url_instagram, url_tiktok, 
        image, gambar_hero, galeri1, galeri2, galeri3, galeri4, is_published
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const values = [
      nama,
      pemilik || '',
      kategori || '',
      deskripsi_singkat || '',
      deskripsi || '',
      tentang || '',
      peta_url || '',
      no_wa || '',
      url_youtube || '',
      url_instagram || '',
      url_tiktok || '',
      imagePath,
      gambarHeroPath,
      g1,
      g2,
      g3,
      g4,
      statusPublish
    ];

    const result = await pool.query(query, values);
    res.json({
      success: true,
      message: 'UMKM berhasil ditambahkan',
      id: Number(result.insertId)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 4. PUT UPDATE UMKM (DILENGKAPI PEMBERSIHAN FOTO LAMA OTOMATIS)
app.put('/api/umkm/:id', verifyToken, uploadUmkm, async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    const {
      judul,
      nama_umkm,
      pemilik,
      kategori,
      deskripsi_singkat,
      deskripsi,
      tentang,
      peta_url,
      no_wa,
      url_youtube,
      url_instagram,
      url_tiktok
    } = req.body;
    const nama = nama_umkm || judul || '';

    conn = await pool.getConnection();

    // 1. Ambil Data Lama
    const rows = await conn.query(
      'SELECT image, gambar_hero, galeri1, galeri2, galeri3, galeri4 FROM umkm WHERE id = ?',
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Data UMKM tidak ditemukan' });
    }
    const dataLama = rows[0];

    // 2. Resolve Path Baru
    const imagePath = getPath(req, 'image');
    const gambarHeroPath = getPath(req, 'gambar_hero');
    const g1 = getPath(req, 'galeri1');
    const g2 = getPath(req, 'galeri2');
    const g3 = getPath(req, 'galeri3');
    const g4 = getPath(req, 'galeri4');

    const query = `
      UPDATE umkm 
      SET 
        nama_umkm = ?, pemilik = ?, kategori = ?, deskripsi_singkat = ?, deskripsi = ?, 
        tentang = ?, peta_url = ?, no_wa = ?, url_youtube = ?, url_instagram = ?, 
        url_tiktok = ?, image = ?, gambar_hero = ?, galeri1 = ?, galeri2 = ?, 
        galeri3 = ?, galeri4 = ? 
      WHERE id = ?
    `;
    const values = [
      nama,
      pemilik || '',
      kategori || '',
      deskripsi_singkat || '',
      deskripsi || '',
      tentang || '',
      peta_url || '',
      no_wa || '',
      url_youtube || '',
      url_instagram || '',
      url_tiktok || '',
      imagePath,
      gambarHeroPath,
      g1,
      g2,
      g3,
      g4,
      id
    ];

    await conn.query(query, values);

    // 3. Bersihkan File Fisik
    const cekDanHapus = (fieldName, pathBaru, pathLama) => {
      const adaUnggahanBaru = req.files && req.files[fieldName];
      const userHapusManual = pathBaru === '' && pathLama && pathLama !== '';

      if (adaUnggahanBaru || userHapusManual) {
        if (pathLama) hapusFileFisik(pathLama);
      }
    };

    cekDanHapus('image', imagePath, dataLama.image);
    cekDanHapus('gambar_hero', gambarHeroPath, dataLama.gambar_hero);
    cekDanHapus('galeri1', g1, dataLama.galeri1);
    cekDanHapus('galeri2', g2, dataLama.galeri2);
    cekDanHapus('galeri3', g3, dataLama.galeri3);
    cekDanHapus('galeri4', g4, dataLama.galeri4);

    res.json({ success: true, message: 'UMKM berhasil diupdate' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// 5. PATCH UPDATE STATUS PUBLISH
app.patch('/api/umkm/:id/status', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_published } = req.body;
    await pool.query('UPDATE umkm SET is_published=? WHERE id=?', [
      is_published ? 1 : 0,
      id
    ]);
    res.json({ success: true, message: 'Status publish diupdate' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 6. DELETE UMKM (DILENGKAPI PEMBERSIHAN FOTO SECARA KESELURUHAN)
app.delete('/api/umkm/:id', verifyToken, async (req, res) => {
  let conn;
  try {
    const { id } = req.params;
    conn = await pool.getConnection();

    // 1. Ambil Data Lama
    const rows = await conn.query(
      'SELECT image, gambar_hero, galeri1, galeri2, galeri3, galeri4 FROM umkm WHERE id=?',
      [id]
    );
    if (rows.length === 0) {
      return res
        .status(404)
        .json({ success: false, message: 'Data UMKM tidak ditemukan' });
    }
    const dataLama = rows[0];

    // 2. Hapus Data
    await conn.query('DELETE FROM umkm WHERE id=?', [id]);

    // 3. Hapus Gambar dari Disk
    const fieldGambar = [
      'image',
      'gambar_hero',
      'galeri1',
      'galeri2',
      'galeri3',
      'galeri4'
    ];
    fieldGambar.forEach((field) => {
      if (dataLama[field]) {
        hapusFileFisik(dataLama[field]);
      }
    });

    res.json({ success: true, message: 'UMKM berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  } finally {
    if (conn) conn.release();
  }
});

// 7. GET PUBLIC LIST UMKM (Hanya yang Published)
app.get('/api/public/umkm', async (req, res) => {
  try {
    const rows = await pool.query(
      'SELECT * FROM umkm WHERE is_published = 1 ORDER BY id DESC'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: 'Terjadi kesalahan pada server' });
  }
});

// 8. GET PUBLIC DETAIL UMKM (Hanya yang Published)
app.get('/api/public/umkm/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const rows = await pool.query(
      'SELECT * FROM umkm WHERE id = ? AND is_published = 1',
      [id]
    );
    if (rows.length === 0)
      return res
        .status(404)
        .json({ success: false, message: 'Data tidak ditemukan' });
    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Terjadi kesalahan' });
  }
});

// ==========================================
// API STATISTIK LAPORAN (Untuk Publik Frontend)
// ==========================================
app.get('/api/public/laporan/stats', async (req, res) => {
  try {
    const query = `
      SELECT 
        SUM(CASE WHEN status = 'Selesai' THEN 1 ELSE 0 END) AS total_selesai,
        SUM(CASE WHEN status = 'Diproses' THEN 1 ELSE 0 END) AS total_diproses,
        SUM(CASE WHEN status = 'Menunggu' THEN 1 ELSE 0 END) AS total_menunggu,
        COUNT(*) AS total_laporan 
      FROM laporan
    `;
    const rows = await pool.query(query);
    const stats = rows[0] || {
      total_selesai: 0,
      total_diproses: 0,
      total_menunggu: 0,
      total_laporan: 0
    };

    res.json({
      success: true,
      data: {
        selesai: Number(stats.total_selesai || 0),
        diproses: Number(stats.total_diproses || 0),
        menunggu: Number(stats.total_menunggu || 0),
        total: Number(stats.total_laporan || 0)
      }
    });
  } catch (error) {
    console.error('Error saat mengambil statistik laporan:', error);
    res
      .status(500)
      .json({ success: false, message: 'Gagal mengambil statistik laporan' });
  }
});

// ==========================================
// API LAPORAN MASYARAKAT
// ==========================================
app.post(
  '/api/public/laporan',
  upload.single('lampiran'),
  async (req, res) => {
    let conn;
    try {
      const { nama_lengkap, kontak, kategori, subjek, pesan } = req.body;
      if (!nama_lengkap || !kontak || !kategori || !subjek || !pesan) {
        return res.status(400).json({
          success: false,
          message: 'Semua kolom wajib diisi kecuali lampiran'
        });
      }

      const lampiranPath = req.file ? '/uploads/' + req.file.filename : null;
      conn = await pool.getConnection();

      const result = await conn.query(
        'INSERT INTO laporan (nama_lengkap, kontak, kategori, subjek, pesan, lampiran) VALUES (?, ?, ?, ?, ?, ?)',
        [nama_lengkap, kontak, kategori, subjek, pesan, lampiranPath]
      );

      const waConfig = await conn.query(
        "SELECT nilai FROM pengaturan WHERE kunci = 'wa_admin_laporan'"
      );
      const nomorWa = waConfig.length > 0 ? waConfig[0].nilai : '';

      res.json({
        success: true,
        message: 'Laporan berhasil dikirim.',
        id: Number(result.insertId),
        wa_number: nomorWa
      });
    } catch (error) {
      console.error('Error saat mengirim laporan:', error);
      res
        .status(500)
        .json({ success: false, message: 'Terjadi kesalahan pada server' });
    } finally {
      if (conn) conn.release();
    }
  }
);

app.get('/api/laporan', verifyToken, async (req, res) => {
  try {
    const rows = await pool.query(
      'SELECT * FROM laporan ORDER BY created_at DESC'
    );
    res.json({ success: true, data: rows });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.patch('/api/laporan/:id/status', verifyToken, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const allowedStatuses = ['Menunggu', 'Diproses', 'Selesai', 'Ditolak'];
  if (!allowedStatuses.includes(status))
    return res.status(400).json({ success: false, message: 'Status tidak valid' });

  try {
    await pool.query('UPDATE laporan SET status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, message: 'Status laporan berhasil diperbarui' });
  } catch (error) {
    res
      .status(500)
      .json({ success: false, message: 'Gagal memperbarui status laporan' });
  }
});

app.delete('/api/laporan/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM laporan WHERE id = ?', [id]);
    res.json({ success: true, message: 'Laporan berhasil dihapus' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/pengaturan/wa', verifyToken, async (req, res) => {
  try {
    const rows = await pool.query(
      "SELECT nilai FROM pengaturan WHERE kunci = 'wa_admin_laporan'"
    );
    res.json({
      success: true,
      data: rows.length > 0 ? rows[0].nilai : ''
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/pengaturan/wa', verifyToken, async (req, res) => {
  const { nomor } = req.body;
  try {
    const rows = await pool.query(
      "SELECT id FROM pengaturan WHERE kunci = 'wa_admin_laporan'"
    );
    if (rows.length > 0) {
      await pool.query(
        "UPDATE pengaturan SET nilai = ? WHERE kunci = 'wa_admin_laporan'",
        [nomor]
      );
    } else {
      await pool.query(
        "INSERT INTO pengaturan (kunci, nilai, deskripsi) VALUES ('wa_admin_laporan', ?, 'Nomor WhatsApp Admin')",
        [nomor]
      );
    }
    res.json({
      success: true,
      message: 'Nomor WhatsApp berhasil diperbarui'
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(
    `Server backend siap menerima koneksi pada host ${HOST} di port ${PORT}`
  );
});