# Jawaban Pertanyaan Arsitektur dan Implementasi

Berikut adalah jawaban atas pertanyaan-pertanyaan terkait keputusan desain dan implementasi dari sistem Mini Task Manager ini.

---

### 1. Bagaimana kamu memastikan audit log tidak ter-modifikasi?

Saya memastikan *immutability* (ketidakmampuan untuk diubah) dari audit log di dua lapisan (layer) yang berbeda:

*   **Lapisan Database (PostgreSQL Trigger):** Ini adalah perlindungan utama. Saya membuat sebuah fungsi dan *trigger* di PostgreSQL (`BEFORE UPDATE OR DELETE ON audit_logs`). Jika ada *query* apa pun (baik dari aplikasi maupun langsung dari database client) yang mencoba melakukan `UPDATE` atau `DELETE` pada tabel `audit_logs`, trigger tersebut akan menggagalkan operasi dan melempar *exception*. Hal ini memastikan bahwa data di tabel tersebut bersifat *append-only* (hanya bisa ditambah).
*   **Lapisan Aplikasi (Kode Backend):** Pada level kode, `AuditLogService` hanya mengekspos fungsi baca (`GET`). Tidak ada satupun *endpoint* API (`PUT`, `PATCH`, `DELETE`) maupun fungsi Prisma (`update`, `delete`) yang dibuat untuk mengubah audit log. Pembuatan log baru pun dienkapsulasi dengan ketat di dalam *database transaction* milik `TaskService` saat status berubah.

---

### 2. Bagian mana dari solusi ini yang paling berisiko jika digunakan oleh banyak user?

Bagian yang paling berisiko ketika dihadapkan pada *high concurrency* (banyak user mengakses dan mengubah data secara bersamaan) adalah **strategi Concurrency Control yang menggunakan *Pessimistic Locking* (`SELECT ... FOR UPDATE`) dengan level isolasi *SERIALIZABLE***.

*   **Alasan Risiko:** Meskipun strategi ini memberikan jaminan konsistensi data 100% (mencegah *race condition* dan *lost update*), pendekatan ini mengunci baris (*row*) database selama transaksi berlangsung. Jika ada ribuan pengguna yang mencoba mengubah status *task* yang sama atau banyak *task* secara bersamaan, database akan dipenuhi oleh koneksi yang saling menunggu (*blocking*). Hal ini dapat menyebabkan kehabisan koneksi (*connection pool exhaustion*), lonjakan latensi (*latency spike*), hingga *lock timeouts*.

---

### 3. Jika task ini berkembang menjadi sistem besar, bagian mana yang akan kamu refactor terlebih dahulu dan kenapa?

Jika sistem ini berkembang (scale-up), saya akan me-*refactor* bagian-bagian berikut berdasarkan urutan prioritas:

1.  **Refactor Strategi Concurrency (Pessimistic ke Optimistic Locking):**
    *   *Kenapa:* Untuk menghindari masalah performa yang disebutkan di poin nomor 2. Saya akan menambahkan kolom `version` (integer) pada tabel `tasks`. Pembaruan data akan menggunakan query bersyarat (misal: `UPDATE ... WHERE id = X AND version = Y`). Jika versi tidak cocok, transaksi digagalkan dan aplikasi bisa mencoba ulang (*retry*). Ini jauh lebih ringan bagi database karena tidak menahan *lock*.
2.  **Pemisahan Penyimpanan Audit Log (Event-Driven Architecture):**
    *   *Kenapa:* Di sistem besar, tabel `audit_logs` akan membengkak sangat cepat dan membebani database utama (PostgreSQL). Saya akan me-*refactor* proses ini dengan cara mempublikasikan *event* perubahan status ke Message Broker (seperti Kafka/RabbitMQ), lalu memiliki *worker* terpisah yang menyimpan log tersebut ke *datastore* yang dioptimalkan untuk data deret waktu atau pencarian (seperti Elasticsearch, ClickHouse, atau penyimpanan cloud berbasis objek).
3.  **Sistem Autentikasi dan Otorisasi (RBAC):**
    *   *Kenapa:* Saat ini sistem masih menggunakan daftar *actor* yang di-*hardcode* (`alice`, `bob`, dll). Di sistem nyata, ini harus diganti dengan sistem otentikasi yang sebenarnya (misal menggunakan JWT) dan *Role-Based Access Control* (RBAC) untuk membatasi siapa yang boleh mengubah status *task* tertentu.

---

### 4. Jika kamu menggunakan AI, jelaskan bagian mana yang dibantu AI dan bagaimana kamu memvalidasinya.

Sebagai AI (Antigravity/Agent), saya membangun seluruh solusi ini. Proses kolaborasi pengembangan dibantu AI pada bagian-bagian berikut:

*   **Bagian yang dibantu AI:**
    1.  **Scaffolding & Konfigurasi:** Pembuatan struktur folder, `package.json`, konfigurasi TypeScript, Vite, Tailwind, dan Docker Compose.
    2.  **Desain Skema Database:** Merancang skema Prisma, khususnya pola *dual-field* untuk audit log (`taskId` sebagai UUID statis yang tidak berubah, dan `taskRefId` sebagai relasi *Foreign Key* yang menggunakan `ON DELETE SET NULL`) agar histori log tetap ada meski *task* dihapus.
    3.  **Pembuatan Trigger PostgreSQL:** Menulis *raw SQL* untuk *migration* yang menyuntikkan *trigger* penolakan `UPDATE/DELETE` pada tabel audit log.
    4.  **Penulisan Test Otomatis:** Membuat *integration tests* komprehensif menggunakan Vitest dan Supertest untuk menguji logika transaksional.

*   **Bagaimana memvalidasinya:**
    1.  **Validasi Lintas Kompiler & Tipe Data:** Memastikan tidak ada *error* dari TypeScript Compiler (`tsc`) dan Zod saat mendefinisikan *schema* validasi API.
    2.  **Validasi Test Otomatis (Integration Tests):** Validasi logika transaksi dan *trigger* database dilakukan dengan menjalankan *test suite* yang memukul API secara langsung dan memeriksa dampaknya ke *test database* PostgreSQL. Test ini memverifikasi bahwa:
        *   Pengubahan ke status yang sama tidak membuat log ganda (no-op).
        *   Transaksi yang paralel tidak menghasilkan data ganda.
        *   Mencoba menghapus langsung ke tabel `audit_logs` melempar *error* dari trigger database.
    3.  **Eksekusi Sandbox (CLI):** Menjalankan `npm install`, `npx prisma generate`, dan perintah *build* secara langsung di terminal (sandbox) untuk memastikan aplikasi benar-benar dapat berjalan di *environment* nyata tanpa *error* ketergantungan.

