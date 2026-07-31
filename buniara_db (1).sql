-- phpMyAdmin SQL Dump
-- version 5.2.1deb1+deb12u1
-- https://www.phpmyadmin.net/
--
-- Host: 192.168.8.211
-- Generation Time: Jul 30, 2026 at 03:58 PM
-- Server version: 10.11.14-MariaDB-0+deb12u2
-- PHP Version: 8.2.28

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `buniara_db`
--

-- --------------------------------------------------------

--
-- Table structure for table `galeri`
--

CREATE TABLE `galeri` (
  `id` int(11) NOT NULL,
  `judul` varchar(255) DEFAULT NULL,
  `nama_file` varchar(255) NOT NULL,
  `kategori` varchar(50) DEFAULT 'umum',
  `path_url` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

-- --------------------------------------------------------

--
-- Table structure for table `konten_web`
--

CREATE TABLE `konten_web` (
  `id` int(11) NOT NULL,
  `hero_headline` varchar(255) DEFAULT NULL,
  `hero_subheadline` text DEFAULT NULL,
  `hero_image` longtext DEFAULT NULL,
  `tentang_judul` varchar(255) DEFAULT NULL,
  `tentang_desc1` text DEFAULT NULL,
  `tentang_desc2` text DEFAULT NULL,
  `tentang_img1` longtext DEFAULT NULL,
  `tentang_img2` longtext DEFAULT NULL,
  `dusun` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`dusun`)),
  `maps_embed` text DEFAULT NULL,
  `kantor_img` longtext DEFAULT NULL,
  `alamat` varchar(255) DEFAULT NULL,
  `jam_operasional` varchar(255) DEFAULT NULL,
  `layanan` varchar(255) DEFAULT NULL,
  `kontak` varchar(50) DEFAULT NULL,
  `perangkat_desa` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`perangkat_desa`)),
  `email` varchar(100) DEFAULT ''
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `konten_web`
--

INSERT INTO `konten_web` (`id`, `hero_headline`, `hero_subheadline`, `hero_image`, `tentang_judul`, `tentang_desc1`, `tentang_desc2`, `tentang_img1`, `tentang_img2`, `dusun`, `maps_embed`, `kantor_img`, `alamat`, `jam_operasional`, `layanan`, `kontak`, `perangkat_desa`, `email`) VALUES
(1, 'Harmoni Alam, Pertanian, dan Pariwisata Buniara.', 'Temukan keindahan alam, kekayaan budaya, dan produk lokal unggulan kami.', '/desa2.jpg', '', 'Desa Buniara, terletak di Kecamatan Tanjungsiang, Kabupaten Subang, adalah surga tersembunyi yang menawarkan keindahan alam yang asri. Dikelilingi oleh hutan lindung yang rindang, desa ini menjadi tempat yang sempurna untuk melarikan diri dari hiruk-pikuk kota.', 'Pemandangan desa ini didominasi oleh kemegahan Gunung Canggah yang menjulang setinggi 2.073 mdpl, memberikan udara segar dan pemandangan yang memukau setiap harinya.', '', '', '[\"Babakan Cilungsir\",\"Campaka\",\"Wangun\",\"Dusun Lainnya\"]', '<iframe src=\"https://maps.google.com/maps?q=Desa+Buniara,+Tanjungsiang,+Subang,+Jawa+Barat&t=&z=14&ie=UTF8&iwloc=&output=embed\" class=\"w-full h-full border-0 absolute inset-0 grayscale-[30%] group-hover:grayscale-0 transition-all duration-700\" loading=\"lazy\" referrerpolicy=\"no-referrer-when-downgrade\"> </iframe>', '', 'Jl. Raya Buniara No. 1, Tanjungsiang.', 'Senin-Jumat, 08:00 - 16:00 WIB.', 'Administrasi, Kependudukan.', '+62 812-XXXX-XXXX', '[{\"nama\":\"Nama\",\"jabatan\":\"Staff\"},{\"nama\":\"Nama\",\"jabatan\":\"Staff\"},{\"nama\":\"asd\",\"jabatan\":\"asd\"}]', 'testinfobuniara@gmail.com');

-- --------------------------------------------------------

--
-- Table structure for table `laporan`
--

CREATE TABLE `laporan` (
  `id` int(11) NOT NULL,
  `nama_lengkap` varchar(255) NOT NULL,
  `kontak` varchar(255) NOT NULL,
  `kategori` varchar(100) NOT NULL,
  `subjek` varchar(255) NOT NULL,
  `pesan` text NOT NULL,
  `lampiran` longtext DEFAULT NULL,
  `status` enum('Menunggu','Diproses','Selesai','Ditolak') DEFAULT 'Menunggu',
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `laporan`
--

INSERT INTO `laporan` (`id`, `nama_lengkap`, `kontak`, `kategori`, `subjek`, `pesan`, `lampiran`, `status`, `created_at`) VALUES
(46, 'Jaenudin', 'Jan@gmail.com', 'Lainnya', 'Kebakaran ', 'Kebakaran Belakang rumah gweh', '/uploads/lampiran-1784861972476-275509964.jpg', 'Menunggu', '2026-07-24 02:59:32'),
(49, 'test', 'test@gmailcom', 'Infrastruktur', 'test', 'test', '/uploads/lampiran-1785416732024-107689286.jpeg', 'Menunggu', '2026-07-30 13:05:32');

-- --------------------------------------------------------

--
-- Table structure for table `pengaturan`
--

CREATE TABLE `pengaturan` (
  `id` int(11) NOT NULL,
  `kunci` varchar(50) NOT NULL,
  `nilai` text NOT NULL,
  `deskripsi` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `pengaturan`
--

INSERT INTO `pengaturan` (`id`, `kunci`, `nilai`, `deskripsi`) VALUES
(1, 'wa_admin_laporan', '6282127480367', 'Nomor WhatsApp untuk menerima laporan masyarakat');

-- --------------------------------------------------------

--
-- Table structure for table `pengguna`
--

CREATE TABLE `pengguna` (
  `id` int(11) NOT NULL,
  `nama` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` varchar(50) DEFAULT 'admin',
  `created_at` timestamp NULL DEFAULT current_timestamp(),
  `is_aktif` tinyint(1) DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `pengguna`
--

INSERT INTO `pengguna` (`id`, `nama`, `email`, `password`, `role`, `created_at`, `is_aktif`) VALUES
(1, 'Administrator', 'admin@buniara.desa.id', '$2b$10$3P5mO6e0t7wueKEGo.wfS.scLE4REQjGGBKdvCDKci9ja66CVubcu', 'admin', '2026-07-21 03:54:38', 1),
(7, 'Sekretaris Desa', 'sekdes@desabuniara.web.id', '$2b$10$5QWzM9nLlPyrlMt2iZQyfedU7b2638mQiAtGhYcEndM/WWCLcsDzS', 'admin', '2026-07-21 04:20:51', 1),
(10, 'test', 'test@dev.com', '$2b$10$bHl0MWJ0ZTvlAqSgOoqlFuqDMSyJGQYN5DgWenG06Rbj0e9qnPd12', 'admin', '2026-07-21 04:31:00', 0),
(16, 'kades', 'kades@dev.com', '$2b$10$u1gteFaXo3GBANNdwTZraOFS422GzDRGVwak/75ZWZCU3p625/gBW', 'admin', '2026-07-21 08:38:17', 1);

-- --------------------------------------------------------

--
-- Table structure for table `sosial_media`
--

CREATE TABLE `sosial_media` (
  `id` int(11) NOT NULL,
  `platform` varchar(50) NOT NULL,
  `url` varchar(255) NOT NULL,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `sosial_media`
--

INSERT INTO `sosial_media` (`id`, `platform`, `url`, `created_at`) VALUES
(10, 'YouTube', 'https://www.youtube.com', '2026-07-24 00:49:05'),
(22, 'Instagram', 'https://www.instagram.com', '2026-07-24 01:14:34'),
(28, 'Facebook', ' https://www.tiktok.com', '2026-07-30 13:07:41');

-- --------------------------------------------------------

--
-- Table structure for table `umkm`
--

CREATE TABLE `umkm` (
  `id` int(11) NOT NULL,
  `nama_umkm` varchar(255) NOT NULL,
  `pemilik` varchar(255) NOT NULL,
  `kategori` varchar(100) NOT NULL,
  `deskripsi_singkat` varchar(255) DEFAULT NULL,
  `deskripsi` text DEFAULT NULL,
  `tentang` text DEFAULT NULL,
  `peta_url` text DEFAULT NULL,
  `no_wa` varchar(30) DEFAULT NULL,
  `url_youtube` varchar(255) DEFAULT NULL,
  `url_instagram` varchar(255) DEFAULT NULL,
  `url_tiktok` varchar(255) DEFAULT NULL,
  `gambar_hero` varchar(255) DEFAULT NULL,
  `galeri1` varchar(255) DEFAULT NULL,
  `galeri2` varchar(255) DEFAULT NULL,
  `galeri3` varchar(255) DEFAULT NULL,
  `galeri4` varchar(255) DEFAULT NULL,
  `image` longtext DEFAULT NULL,
  `is_published` tinyint(1) DEFAULT 0,
  `created_at` timestamp NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `umkm`
--

INSERT INTO `umkm` (`id`, `nama_umkm`, `pemilik`, `kategori`, `deskripsi_singkat`, `deskripsi`, `tentang`, `peta_url`, `no_wa`, `url_youtube`, `url_instagram`, `url_tiktok`, `gambar_hero`, `galeri1`, `galeri2`, `galeri3`, `galeri4`, `image`, `is_published`, `created_at`) VALUES
(19, 'Kopi Gunung Canggah', 'Ibu diah', 'Makanan & Minuman', 'Rasakan kekuatan dan keunikan Kopi Robusta premium yang ditanam dengan penuh dedikasi di lereng subur Gunung Canggah. Sebuah warisan cita rasa dari tanah Buniara.', 'Kopi robusta pilihan dengan aroma khas dari lereng Gunung Canggah.', 'Kopi Gunung Canggah merupakan permata tersembunyi dari Desa Buniara. Ditanam di lereng subur dengan iklim mikro yang unik, kopi ini menawarkan profil rasa yang kompleks dan mendalam. Setiap biji diproses dengan ketelitian tinggi untuk menjaga kualitas warisan leluhur. \r\n\r\nKekhasan kopi ini terletak pada proses pemanggaran tradisional menggunakan kayu bakar, yang memberikan aroma smoky yang halus tanpa menutupi karakter asli biji Robusta premium kami. Ini adalah hasil dedikasi petani lokal yang menjaga harmoni dengan alam.', '<iframe src=\"https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d15854.69519544049!2d107.77546530000001!3d-6.562795299999999!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2e6938929e40dcbd%3A0xd4093e3973be364e!2sRM%20Bale%20Desa%20Saung%20Balong!5e0!3m2!1sid!2sid!4v1785393205536!5m2!1sid!2sid\" width=\"600\" height=\"450\" style=\"border:0;\" allowfullscreen=\"\" loading=\"lazy\" referrerpolicy=\"strict-origin-when-cross-origin\"></iframe>', '08881192379', 'http://youtube.com/', 'https://www.instagram.com/', 'http://tiktok.com/', '', '', '', '', '', '', 1, '2026-07-23 00:47:51'),
(22, 'Madu Hutan Alami', 'Pa samsul', 'Makanan & Minuman', NULL, 'Madu murni dari hutan lindung Buniara, kaya akan nutrisi dan manfaat.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '', 1, '2026-07-23 00:48:18'),
(25, 'Kerajinan Bambu', 'Pa adam', 'Kerajinan Tangan', NULL, 'Anyaman bambu tradisional berkualitas tinggi hasil karya pengrajin lokal.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '', 1, '2026-07-23 00:48:59'),
(28, 'Gula Aren Asli', 'Pa Ajay', 'Makanan & Minuman', '', 'Gula aren murni hasil sadapan petani lokal dengan rasa manis alami.', '', '', '82127480367', '', '', '', '', '', '', '', '', '', 1, '2026-07-23 00:49:32');

-- --------------------------------------------------------

--
-- Table structure for table `wisata`
--

CREATE TABLE `wisata` (
  `id` int(11) NOT NULL,
  `judul` varchar(255) NOT NULL,
  `kategori` varchar(100) NOT NULL,
  `deskripsi` text NOT NULL,
  `tentang` text DEFAULT NULL,
  `fasilitas` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`fasilitas`)),
  `peta_url` text DEFAULT NULL,
  `galeri_1` varchar(255) DEFAULT NULL,
  `galeri_2` varchar(255) DEFAULT NULL,
  `galeri_3` varchar(255) DEFAULT NULL,
  `galeri_4` varchar(255) DEFAULT NULL,
  `image` longtext NOT NULL,
  `gambar_hero` varchar(255) DEFAULT '',
  `is_published` tinyint(1) NOT NULL DEFAULT 1,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- Dumping data for table `wisata`
--

INSERT INTO `wisata` (`id`, `judul`, `kategori`, `deskripsi`, `tentang`, `fasilitas`, `peta_url`, `galeri_1`, `galeri_2`, `galeri_3`, `galeri_4`, `image`, `gambar_hero`, `is_published`, `created_at`) VALUES
(19, 'Curug Wangun', 'Wisata Alam', 'Air terjun alami dengan kesegaran air pegunungan yang jernih.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '', '', 1, '2026-07-23 00:43:47'),
(22, 'Curug Janari', 'Wisata Alam', 'Destinasi wisata air tersembunyi yang menenangkan jiwa.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '', '', 1, '2026-07-23 00:44:04'),
(25, 'Kolam Tirta Indah', 'Wisata Buatan', 'Fasilitas rekreasi keluarga dengan air langsung dari sumber mata air.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '', '', 1, '2026-07-23 00:44:27'),
(28, 'Indah Alam', 'Wisata Alam', 'Spot panorama untuk menikmati keindahan lanskap pegunungan Subang.\r\n\r\n', 'Curug Wangun merupakan permata tersembunyi yang terletak di jantung Desa Buniara. Dikelilingi oleh vegetasi tropis yang rimbun dan tebing batu purba, air terjun ini menawarkan pemandangan spektakuler dengan ketinggian sekitar 30 meter. Suasana di sini sangat tenang, hanya terdengar gemuruh air yang jatuh dan kicauan burung hutan.\r\n\r\nKekhasan Curug Wangun terletak pada kolam alaminya yang berwarna biru kehijauan yang jernih. Para pengunjung dapat merasakan kesegaran air pegunungan yang murni, menjadikannya tempat pelarian sempurna dari hiruk-pikuk kehidupan kota. Jalur trekking menuju lokasi pun telah ditata rapi untuk memudahkan wisatawan tanpa mengurangi kesan petualangan alam.', '[{\"judul\":\"test1\",\"deskripsi\":\"test3\"},{\"judul\":\"test2\",\"deskripsi\":\"test2\"},{\"judul\":\"test3\",\"deskripsi\":\"test1\"}]', '<iframe src=\"https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d15854.864785639973!2d107.7699292205963!3d-6.557466005579945!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sid!2sid!4v1785296212676!5m2!1sid!2sid\" width=\"600\" height=\"450\" style=\"border:0;\" allowfullscreen=\"\" loading=\"lazy\" referrerpolicy=\"strict-origin-when-cross-origin\"></iframe>', '', '', '', '', '', '', 1, '2026-07-23 00:44:44'),
(31, 'Sawah Terasering', 'Wisata Budaya', 'Nikmati pemandangan hijau persawahan terasering khas pedesaan.', '', '[{\"judul\":\"1\",\"deskripsi\":\"1\"}]', '', '', '', '', '', '', '', 1, '2026-07-23 00:45:06');

--
-- Indexes for dumped tables
--

--
-- Indexes for table `galeri`
--
ALTER TABLE `galeri`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `konten_web`
--
ALTER TABLE `konten_web`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `laporan`
--
ALTER TABLE `laporan`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `pengaturan`
--
ALTER TABLE `pengaturan`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `kunci` (`kunci`);

--
-- Indexes for table `pengguna`
--
ALTER TABLE `pengguna`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `email` (`email`);

--
-- Indexes for table `sosial_media`
--
ALTER TABLE `sosial_media`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `umkm`
--
ALTER TABLE `umkm`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `wisata`
--
ALTER TABLE `wisata`
  ADD PRIMARY KEY (`id`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `galeri`
--
ALTER TABLE `galeri`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `konten_web`
--
ALTER TABLE `konten_web`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `laporan`
--
ALTER TABLE `laporan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=50;

--
-- AUTO_INCREMENT for table `pengaturan`
--
ALTER TABLE `pengaturan`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=2;

--
-- AUTO_INCREMENT for table `pengguna`
--
ALTER TABLE `pengguna`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=20;

--
-- AUTO_INCREMENT for table `sosial_media`
--
ALTER TABLE `sosial_media`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=29;

--
-- AUTO_INCREMENT for table `umkm`
--
ALTER TABLE `umkm`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=38;

--
-- AUTO_INCREMENT for table `wisata`
--
ALTER TABLE `wisata`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT, AUTO_INCREMENT=41;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
