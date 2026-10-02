import { ConstructionStatus } from '@prisma/client';

export const DEMO_NOTICE =
  'DEMO — Tamamen kurgusal örnek proje. Fotoğraf temsilidir; Türkiye’deki gerçek bir taşınmazı göstermez.';

export const demoPhotos = [
  'photo-1673350772389-8629363cf6ba',
  'photo-1690221120099-7556a7f67fcc',
  'photo-1685631107156-95098e83b730',
  'photo-1534655610770-dd69616f05ff',
  'photo-1673350474055-e62f5818fcfe',
].map((id) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=85`);

export const seedProjects = [
  { slug: 'seed-bosphorus', name: 'Seed Bosphorus', organization: 'development-yapi' },
  { slug: 'seed-park', name: 'Seed Park', organization: 'development-yapi' },
  { slug: 'seed-garden', name: 'Seed Garden', organization: 'development-yapi' },
  { slug: 'capital-vista', name: 'Capital Vista', organization: 'capital-homes' },
  { slug: 'capital-metro', name: 'Capital Metro', organization: 'capital-homes' },
  { slug: 'capital-north', name: 'Capital North', organization: 'capital-homes' },
] as const;

export type DemoProject = {
  slug: string;
  name: string;
  province: { code: string; name: string; slug: string };
  district: { code: string; name: string; slug: string };
  latitude: string;
  longitude: string;
  price: string;
  currency: 'TRY' | 'USD';
  deliveryDate: string | null;
  constructionStatus: ConstructionStatus;
  summary: string;
  rooms: readonly [string, string];
  photo: number;
};

const istanbul = { code: 'TR-34', name: 'İstanbul', slug: 'istanbul' };
const izmir = { code: 'TR-35', name: 'İzmir', slug: 'izmir' };
const mugla = { code: 'TR-48', name: 'Muğla', slug: 'mugla' };
const antalya = { code: 'TR-07', name: 'Antalya', slug: 'antalya' };
const bursa = { code: 'TR-16', name: 'Bursa', slug: 'bursa' };

export const demoProjects: readonly DemoProject[] = [
  {
    slug: 'demo-avlu-evleri',
    name: 'Avlu Evleri (Demo)',
    province: istanbul,
    district: { code: 'TR-34-KADIKOY', name: 'Kadıköy', slug: 'kadikoy' },
    latitude: '40.982900',
    longitude: '29.045500',
    price: '8450000',
    currency: 'TRY',
    deliveryDate: '2027-12-31',
    constructionStatus: ConstructionStatus.UNDER_CONSTRUCTION,
    summary:
      'Ağaçlarla çevrili ortak avlu, geniş balkonlar ve sakin bir mahalle yaşamı üzerine kurgulanmış örnek konut tasarımı.',
    rooms: ['2+1', '3+1'],
    photo: 0,
  },
  {
    slug: 'demo-koruluk',
    name: 'Koruluk (Demo)',
    province: istanbul,
    district: { code: 'TR-34-BEYKOZ', name: 'Beykoz', slug: 'beykoz' },
    latitude: '41.120000',
    longitude: '29.100000',
    price: '12800000',
    currency: 'TRY',
    deliveryDate: null,
    constructionStatus: ConstructionStatus.PLANNED,
    summary:
      'Orman dokusundan ilham alan, doğal malzemeler ve ferah teraslarla tasarlanan kurgusal bir yaşam koleksiyonu.',
    rooms: ['3+1', '4+1'],
    photo: 4,
  },
  {
    slug: 'demo-kiyi-teras',
    name: 'Kıyı Teras (Demo)',
    province: izmir,
    district: { code: 'TR-35-KARSIYAKA', name: 'Karşıyaka', slug: 'karsiyaka' },
    latitude: '38.455500',
    longitude: '27.109000',
    price: '6950000',
    currency: 'TRY',
    deliveryDate: '2026-06-30',
    constructionStatus: ConstructionStatus.READY,
    summary:
      'Gün ışığı alan iç mekanlar ve geniş açık alanlarla Ege yaşamını hayal eden temsili bir proje.',
    rooms: ['1+1', '2+1'],
    photo: 1,
  },
  {
    slug: 'demo-zeytin-bahcesi',
    name: 'Zeytin Bahçesi (Demo)',
    province: mugla,
    district: { code: 'TR-48-BODRUM', name: 'Bodrum', slug: 'bodrum' },
    latitude: '37.035300',
    longitude: '27.429200',
    price: '395000',
    currency: 'USD',
    deliveryDate: '2027-05-31',
    constructionStatus: ConstructionStatus.UNDER_CONSTRUCTION,
    summary:
      'Taş, ahşap ve peyzajın bir araya geldiği; avlu ve teras odaklı kurgusal bir yazlık yaşam önerisi.',
    rooms: ['2+1', '3+1'],
    photo: 2,
  },
  {
    slug: 'demo-liman-evleri',
    name: 'Liman Evleri (Demo)',
    province: antalya,
    district: { code: 'TR-07-KONYAALTI', name: 'Konyaaltı', slug: 'konyaalti' },
    latitude: '36.875000',
    longitude: '30.635000',
    price: '245000',
    currency: 'USD',
    deliveryDate: '2026-08-31',
    constructionStatus: ConstructionStatus.READY,
    summary:
      'Akdeniz ışığını ve açık hava yaşamını odağına alan, geniş balkonlu temsili şehir konutları.',
    rooms: ['1+1', '2+1'],
    photo: 3,
  },
  {
    slug: 'demo-nilufer-konaklari',
    name: 'Nilüfer Konakları (Demo)',
    province: bursa,
    district: { code: 'TR-16-NILUFER', name: 'Nilüfer', slug: 'nilufer' },
    latitude: '40.218800',
    longitude: '28.984500',
    price: '5850000',
    currency: 'TRY',
    deliveryDate: '2028-03-31',
    constructionStatus: ConstructionStatus.PLANNED,
    summary:
      'Geniş aile yaşamı, yeşil avlular ve yürüyüş rotaları etrafında geliştirilmiş örnek proje fikri.',
    rooms: ['3+1', '4+1'],
    photo: 0,
  },
  {
    slug: 'demo-urla-tas-avlu',
    name: 'Urla Taş Avlu (Demo)',
    province: izmir,
    district: { code: 'TR-35-URLA', name: 'Urla', slug: 'urla' },
    latitude: '38.322900',
    longitude: '26.764000',
    price: '11250000',
    currency: 'TRY',
    deliveryDate: '2027-09-30',
    constructionStatus: ConstructionStatus.UNDER_CONSTRUCTION,
    summary:
      'Doğal taş dokusu ve gölgeli avlularıyla yavaş yaşamı anlatan, tamamen kurgusal bir konut seçkisi.',
    rooms: ['2+1', '3+1'],
    photo: 4,
  },
  {
    slug: 'demo-mavi-yamac',
    name: 'Mavi Yamaç (Demo)',
    province: mugla,
    district: { code: 'TR-48-FETHIYE', name: 'Fethiye', slug: 'fethiye' },
    latitude: '36.621700',
    longitude: '29.116400',
    price: '315000',
    currency: 'USD',
    deliveryDate: null,
    constructionStatus: ConstructionStatus.PLANNED,
    summary:
      'Teraslı kütleler, dingin renkler ve peyzajla bütünleşen mekanlardan oluşan örnek yaşam senaryosu.',
    rooms: ['2+1', '4+1'],
    photo: 2,
  },
  {
    slug: 'demo-kent-bahcesi',
    name: 'Kent Bahçesi (Demo)',
    province: istanbul,
    district: { code: 'TR-34-ATASEHIR', name: 'Ataşehir', slug: 'atasehir' },
    latitude: '40.987100',
    longitude: '29.123000',
    price: '7350000',
    currency: 'TRY',
    deliveryDate: '2028-06-30',
    constructionStatus: ConstructionStatus.UNDER_CONSTRUCTION,
    summary:
      'Şehir ritmi içinde ortak bahçe ve aydınlık yaşam alanlarını buluşturan temsili bir konut projesi.',
    rooms: ['1+1', '3+1'],
    photo: 1,
  },
];
