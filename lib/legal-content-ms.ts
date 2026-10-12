import { EU_DPA_LINK, ICO_LINK, SITE_URL, list, p, supportLink, type LegalDoc } from '@/lib/legal-content';

// Bahasa Melayu version of the Privacy Policy, required alongside English by Malaysia's PDPA (s.7(3)).
// Keep it in step with PRIVACY_POLICY in lib/legal-content.ts: same sections, same ids, same effective date.

const siteLink = { link: 'nonsense.adamchok.com', href: SITE_URL };
const englishLink = { link: 'English', href: '/privacy' };
const jpdpLink = { link: 'Jabatan Perlindungan Data Peribadi (JPDP)', href: 'https://www.pdp.gov.my' };

export const PRIVACY_POLICY_MS: LegalDoc = {
  title: 'Dasar Privasi',
  metaTitle: 'Dasar Privasi · Nonsense',
  description: 'Cara Nonsense, penjejak sesi poker rumah percuma, mengumpul, menggunakan dan melindungi maklumat anda.',
  effective: 'Berkuat kuasa 13 Oktober 2026',
  lang: 'ms',
  tocLabel: 'Kandungan',
  intro: [
    'Nonsense ialah penjejak sesi poker untuk permainan di rumah, tersedia di Android dan di ',
    siteLink,
    '. Ia dibina dan dikendalikan oleh Adam Chok, pembangun individu yang berpangkalan di Malaysia (“kami”), yang bertanggungjawab ke atas data peribadi anda seperti yang diterangkan di sini. Dasar ini menerangkan maklumat yang dikumpul oleh Nonsense, sebabnya, siapa yang boleh melihatnya, serta pilihan dan hak anda. Dasar ini juga tersedia dalam bahasa ',
    englishLink,
    '.',
  ],
  sections: [
    {
      id: 'information-we-collect',
      title: 'Maklumat yang kami kumpul',
      blocks: [
        p(
          { bold: 'Maklumat akaun.' },
          ' Apabila anda log masuk, kami menerima alamat e-mel anda dan ID akaun unik daripada Firebase Authentication. Jika anda log masuk dengan Google, kami menerima alamat e-mel akaun Google anda dan maklumat profil asas untuk tujuan log masuk sahaja. Jika anda mendaftar dengan e-mel dan kata laluan, kata laluan anda dikendalikan oleh Firebase Authentication dan tidak pernah dapat dilihat oleh kami.'
        ),
        p(
          { bold: 'Profil.' },
          ' Nama paparan dan avatar yang anda pilih, serta kod rujukan rakan anda. Maklumat ini dipaparkan kepada rakan, ahli kumpulan dan pemain lain dalam sesi yang anda sertai.'
        ),
        p(
          { bold: 'Kandungan yang anda cipta.' },
          ' Sesi poker dan butirannya (tarikh dan masa, nama lokasi pilihan, blind pilihan, belian masuk, kemasukan semula, tunai keluar, keputusan dan penyelesaian), lokasi yang disimpan, rakan dan permintaan rakan, serta kumpulan dan ahlinya.'
        ),
        p(
          { bold: 'Maklumat tentang orang lain.' },
          ' Apabila anda menganjurkan sesi, anda boleh menambah pemain lain, termasuk tetamu yang tidak menggunakan Nonsense, dengan memasukkan nama mereka. Pengguna lain juga boleh menambah anda ke dalam sesi dan kumpulan mereka. Tambahlah orang lain hanya dengan cara yang mereka jangkakan.'
        ),
        p(
          { bold: 'Tetapan pada peranti anda.' },
          ' Pilihan tema dan status log masuk anda disimpan secara setempat pada peranti anda.'
        ),
        p(
          { bold: 'Maklumat teknikal.' },
          ' Penyedia pengehosan dan sistem belakang kami memproses data teknikal biasa, seperti alamat IP, jenis peranti dan pelayar, serta log permintaan, untuk menyampaikan dan melindungi perkhidmatan.'
        ),
        p(
          { bold: 'Kamera dan foto.' },
          ' Nonsense menggunakan kamera, atau foto yang anda pilih daripada galeri, hanya untuk membaca kod QR rakan, dan hanya selepas anda membenarkannya dalam tetapan peranti. Imej diproses pada peranti anda dan tidak dimuat naik atau disimpan. Nonsense tidak merakam audio.'
        ),
        p(
          { bold: 'Maklumat yang wajib.' },
          ' Akaun (e-mel atau Google) dan nama paparan diperlukan untuk menggunakan Nonsense. Maklumat lain, seperti lokasi, blind, avatar, rakan dan kumpulan, adalah pilihan. Jika anda tidak memberikan maklumat yang wajib, anda tidak akan dapat menggunakan aplikasi ini.'
        ),
        p(
          'Sila jangan masukkan maklumat sensitif, seperti butiran kesihatan, agama atau akaun kewangan, dalam nama, lokasi atau ruang teks bebas yang lain.'
        ),
      ],
    },
    {
      id: 'where-information-comes-from',
      title: 'Sumber maklumat',
      blocks: [
        list(
          ['Daripada anda, apabila anda mendaftar, mengemas kini profil dan menggunakan aplikasi.'],
          ['Daripada Google, jika anda memilih untuk log masuk dengan Google.'],
          ['Daripada pengguna lain, apabila mereka menambah anda ke dalam sesi, kumpulan atau senarai rakan mereka.'],
          ['Secara automatik, daripada peranti anda dan penyedia perkhidmatan kami, seperti yang diterangkan di atas.']
        ),
      ],
    },
    {
      id: 'how-we-use-information',
      title: 'Cara kami menggunakan maklumat',
      blocks: [
        p(
          'Kami hanya menggunakan data peribadi untuk tujuan di bawah. Jika undang-undang perlindungan data seperti GDPR memerlukan asas undang-undang, ia dinyatakan dalam kurungan.'
        ),
        list(
          [
            'Untuk mencipta akaun anda, melog masuk anda dan menyegerakkan rekod anda merentas peranti (untuk menyediakan perkhidmatan yang anda minta).',
          ],
          [
            'Untuk memaparkan keputusan sesi, sejarah, statistik dan papan pendahulu kepada anda dan pemain bersama anda, termasuk memastikan rekod sesi bersama kekal tepat untuk pemain lain (untuk menyediakan perkhidmatan, dan kepentingan sah kami serta pemain lain terhadap rekod bersama yang tepat).',
          ],
          ['Untuk membolehkan anda mencari dan berhubung dengan rakan dan kumpulan (untuk menyediakan perkhidmatan).'],
          [
            'Untuk menghantar e-mel akaun, seperti pengesahan e-mel dan penetapan semula kata laluan (untuk menyediakan perkhidmatan). Kami tidak menghantar e-mel pemasaran.',
          ],
          [
            'Untuk memastikan perkhidmatan selamat, mencegah penyalahgunaan, serta mengesan dan membaiki masalah (kepentingan sah kami untuk mengendalikan perkhidmatan yang selamat dan berfungsi).',
          ],
          ['Untuk mematuhi undang-undang dan menjawab permintaan yang sah (kewajipan undang-undang).'],
          [
            'Untuk membaca kod QR rakan dengan kamera anda (kebenaran anda, yang boleh ditarik balik dalam tetapan peranti).',
          ]
        ),
        p(
          'Kami tidak menjual maklumat anda, menggunakannya untuk pengiklanan, membina profil pengiklanan, menggunakannya untuk melatih model AI, atau membuat keputusan automatik tentang anda yang mempunyai kesan undang-undang atau kesan ketara yang serupa.'
        ),
      ],
    },
    {
      id: 'google-user-data',
      title: 'Data pengguna Google',
      blocks: [
        p(
          'Jika anda log masuk dengan Google, Nonsense hanya mengakses alamat e-mel dan maklumat profil asas anda, dan menggunakannya hanya untuk mencipta dan melog masuk ke akaun Nonsense anda. Kami tidak mengakses sebarang data Google yang lain. Penggunaan dan pemindahan maklumat yang diterima daripada API Google oleh Nonsense mematuhi ',
          {
            link: 'Google API Services User Data Policy',
            href: 'https://developers.google.com/terms/api-services-user-data-policy',
          },
          ', termasuk keperluan Penggunaan Terhad (Limited Use).'
        ),
      ],
    },
    {
      id: 'who-can-see-your-information',
      title: 'Siapa yang boleh melihat maklumat anda',
      blocks: [
        p(
          { bold: 'Pengguna lain.' },
          ' Nama paparan, avatar dan kod rujukan anda boleh dilihat oleh orang yang menambah anda sebagai rakan. Butiran dan keputusan sesi boleh dilihat oleh pemain dalam sesi tersebut, dan papan pendahulu kumpulan boleh dilihat oleh ahli kumpulan itu. Sesiapa yang anda kongsikan ringkasan sesi atau kod QR boleh melihat kandungannya.'
        ),
        p(
          { bold: 'Penyedia perkhidmatan.' },
          ' Google Firebase (log masuk, pangkalan data dan fungsi pelayan; pangkalan data disimpan di Singapura), Cloudflare (pengehosan laman web) dan Expo (kemas kini aplikasi). Mereka memproses data bagi pihak kami, di bawah terma perlindungan data mereka, hanya untuk mengendalikan perkhidmatan.'
        ),
        p(
          { bold: 'Sebab undang-undang.' },
          ' Kami mungkin mendedahkan maklumat jika dikehendaki oleh undang-undang, atau jika perlu untuk melindungi hak, harta atau keselamatan pengguna dan orang lain.'
        ),
        p(
          { bold: 'Pemilik baharu.' },
          ' Jika Nonsense dipindahkan kepada pihak lain, maklumat anda mungkin turut dipindahkan, dan dasar ini akan terus terpakai ke atasnya.'
        ),
        p('Kami tidak berkongsi maklumat anda dengan pihak lain.'),
      ],
    },
    {
      id: 'cookies-and-local-storage',
      title: 'Kuki dan storan setempat',
      blocks: [
        p(
          'Nonsense tidak menggunakan kuki pengiklanan, analitik atau penjejakan. Laman web dan aplikasi menyimpan beberapa item pada peranti anda yang benar-benar diperlukan untuk berfungsi: sesi log masuk anda (disimpan oleh Firebase Authentication), pilihan tema anda, dan catatan sama ada anda telah log masuk supaya halaman yang betul dimuatkan dahulu. Oleh kerana item ini penting, kami tidak meminta persetujuan untuknya. Anda boleh mengosongkannya pada bila-bila masa dalam tetapan pelayar atau peranti, dan ini akan melog keluar anda.'
        ),
      ],
    },
    {
      id: 'international-transfers',
      title: 'Lokasi pemprosesan data anda',
      blocks: [
        p(
          'Rekod pangkalan data anda disimpan di Singapura. Penyedia perkhidmatan kami juga mungkin memproses data di negara lain, termasuk Amerika Syarikat, yang undang-undang privasinya mungkin berbeza daripada tempat anda tinggal. Apabila data dipindahkan, kami bergantung pada komitmen perlindungan data penyedia kami, termasuk fasal kontrak standard jika dikehendaki oleh undang-undang, supaya data kekal dilindungi pada tahap yang setanding.'
        ),
      ],
    },
    {
      id: 'retention-and-deletion',
      title: 'Penyimpanan dan pemadaman',
      blocks: [
        p(
          'Kami menyimpan maklumat anda selagi akaun anda wujud. Anda boleh memadam akaun anda pada bila-bila masa dalam aplikasi di bawah Profil, kemudian Padam akaun; ini berkuat kuasa serta-merta. Jika anda tidak dapat log masuk, e-mel ',
          supportLink,
          ' daripada alamat e-mel akaun anda dan kami akan memadamkannya dalam tempoh 30 hari.'
        ),
        p(
          'Memadam akaun anda akan membuang profil, log masuk, rakan, permintaan rakan, kumpulan milik anda, lokasi yang disimpan dan sesi yang hanya dimainkan oleh anda dan tetamu anda. Sesi yang turut disertai pemain lain mengekalkan jumlah yang direkodkan supaya sejarah mereka kekal tepat, tetapi nama anda digantikan dengan “Deleted player” dan tidak lagi dikaitkan dengan mana-mana profil.'
        ),
        p(
          'Data yang dipadam mungkin kekal dalam sandaran penyedia kami untuk tempoh terhad (bagi Google Cloud, sehingga kira-kira 180 hari) sebelum dipadam secara kekal, dan tidak digunakan dalam tempoh itu. Log teknikal disimpan oleh penyedia kami untuk tempoh singkat bagi tujuan keselamatan. Maklumat yang telah dinyahnamakan sehingga tidak lagi dapat mengenal pasti anda mungkin disimpan.'
        ),
      ],
    },
    {
      id: 'security',
      title: 'Keselamatan',
      blocks: [
        p(
          'Data dihantar melalui sambungan yang disulitkan (HTTPS), disimpan dalam keadaan disulitkan oleh penyedia kami, dan dilindungi oleh peraturan akses supaya hanya orang yang berkenaan boleh membacanya. Tiada sistem yang selamat sepenuhnya, tetapi kami mengambil langkah munasabah untuk melindungi maklumat anda. Jika pelanggaran data berkemungkinan menyebabkan kemudaratan ketara kepada anda, kami akan memaklumkan anda dan pihak berkuasa yang berkenaan seperti yang dikehendaki oleh undang-undang.'
        ),
      ],
    },
    {
      id: 'your-rights',
      title: 'Hak dan pilihan anda',
      blocks: [
        p('Bergantung pada tempat anda tinggal, anda mempunyai sebahagian atau semua hak berikut:'),
        list(
          [{ bold: 'Akses.' }, ' Meminta salinan data peribadi anda yang kami simpan.'],
          [
            { bold: 'Pembetulan.' },
            ' Membetulkan data yang tidak tepat. Anda boleh menukar nama dan avatar anda dalam aplikasi pada bila-bila masa.',
          ],
          [
            { bold: 'Pemadaman.' },
            ' Memadam akaun anda dalam aplikasi di bawah Profil, kemudian Padam akaun, atau meminta kami memadam data tertentu.',
          ],
          [{ bold: 'Kemudahalihan.' }, ' Meminta data anda dalam format biasa yang boleh dibaca oleh mesin.'],
          [
            { bold: 'Bantahan dan sekatan.' },
            ' Membantah, atau meminta kami mengehadkan, cara kami menggunakan data anda, termasuk apabila kami bergantung pada kepentingan sah.',
          ],
          [
            { bold: 'Menarik balik kebenaran.' },
            ' Mematikan akses kamera dalam tetapan peranti anda pada bila-bila masa.',
          ]
        ),
        p(
          'Untuk membuat permintaan, e-mel ',
          supportLink,
          ' daripada alamat e-mel akaun anda supaya kami dapat mengesahkan identiti anda. Permintaan adalah percuma, dan kami akan membalas dalam tempoh 21 hari (atau lebih awal jika dikehendaki oleh undang-undang). Jika kami tidak dapat memenuhi permintaan anda, kami akan menerangkan sebabnya.'
        ),
        p(
          'Jika anda tidak berpuas hati dengan cara kami mengendalikan data anda, sila hubungi kami dahulu. Anda juga boleh membuat aduan kepada pihak berkuasa perlindungan data: di Malaysia, ',
          jpdpLink,
          '; di EU, pihak berkuasa tempatan anda (lihat ',
          EU_DPA_LINK,
          '); di UK, ',
          ICO_LINK,
          '.'
        ),
      ],
    },
    {
      id: 'us-residents',
      title: 'Notis untuk penduduk Amerika Syarikat',
      blocks: [
        p(
          'Kami tidak menjual atau berkongsi maklumat peribadi untuk pengiklanan bersasar, seperti yang ditakrifkan dalam undang-undang privasi negeri di Amerika Syarikat, dan kami tidak menggunakan maklumat peribadi sensitif untuk membuat inferens tentang ciri-ciri anda. Anda boleh menggunakan hak yang diterangkan di atas, dan kami tidak akan melayan anda secara berbeza kerana berbuat demikian.'
        ),
      ],
    },
    {
      id: 'children',
      title: 'Kanak-kanak',
      blocks: [
        p(
          'Nonsense bertujuan untuk orang dewasa berumur 18 tahun ke atas dan tidak ditujukan kepada kanak-kanak. Jika anda percaya seorang kanak-kanak telah mencipta akaun atau ditambah ke dalam sesi, hubungi kami dan kami akan memadamkan maklumat mereka.'
        ),
      ],
    },
    {
      id: 'changes-to-this-policy',
      title: 'Perubahan pada dasar ini',
      blocks: [
        p(
          'Kami mungkin mengemas kini dasar ini. Jika kami membuat perubahan yang ketara, kami akan mengemas kini tarikh di atas dan memaklumkan anda dalam aplikasi sebelum ia berkuat kuasa. Dasar ini tersedia dalam bahasa Inggeris dan Bahasa Melayu; jika terdapat perbezaan, versi bahasa Inggeris terpakai.'
        ),
      ],
    },
    {
      id: 'contact',
      title: 'Hubungi kami',
      blocks: [p('Adam Chok, Malaysia. Pertanyaan atau permintaan: ', supportLink)],
    },
  ],
};
