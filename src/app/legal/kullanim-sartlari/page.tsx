import Link from "next/link";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/LegalDoc";
import { LEGAL_CONTROLLER_NAME, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/config/site";

export const metadata: Metadata = { title: "Kullanım Şartları" };

export default function TermsPage() {
  return (
    <LegalDoc title="Kullanım Şartları">
      <p>
        Shovrum&apos;a hoş geldin. Uygulamayı kullanarak bu şartları kabul etmiş olursun. Lütfen dikkatle oku; anlamadığın bir yer olursa bize yaz.
      </p>

      <h2>1. Kimiz?</h2>
      <p>
        Shovrum, fotoğraf, video (Reels), hikaye ve gönderi paylaşmanı, insanları takip etmeni ve mesajlaşmanı sağlayan bir sosyal medya uygulamasıdır. Hizmeti sunan taraf: <strong>{LEGAL_CONTROLLER_NAME}</strong>.
      </p>

      <h2>2. Yaş sınırı ve ebeveyn bilgisi</h2>
      <ul>
        <li>Shovrum&apos;u kullanmak için en az <strong>13 yaşında</strong> olmalısın.</li>
        <li>18 yaşından küçükler, uygulamayı ebeveyninin veya velisinin bilgisi dahilinde kullanmalıdır.</li>
        <li>Yaşını yanlış beyan ettiğini fark edersek hesabı kapatabiliriz.</li>
      </ul>

      <h2>3. Hesabın</h2>
      <ul>
        <li>Verdiğin bilgilerin doğru olması gerekir. Hesabın ve şifren senin sorumluluğundadır; başkasıyla paylaşma.</li>
        <li>Her kişi bir hesap açmalıdır. Başkasının kimliğine bürünmek yasaktır.</li>
        <li>Hesabında olan her şeyden (paylaştığın içerik dahil) sen sorumlusun.</li>
      </ul>

      <h2>4. İçeriğin ve izinler</h2>
      <p>
        Paylaştığın içeriğin sahibi sen kalırsın. Ancak içeriği senin adına barındırabilmemiz, göstermemiz, yedeklememiz ve uygulamanın çalışması için gerekli teknik işlemleri (yeniden boyutlandırma, sıkıştırma vb.) yapabilmemiz için bize sınırlı, dünya çapında ve ücretsiz bir kullanım izni vermiş olursun. Bu izin içeriğini sildiğinde veya hesabını kapattığında sona erer; yedeklerde kalan kopyalar makul bir sürede silinir.
      </p>
      <p>
        Başkasına ait müzik, fotoğraf veya videoyu izinsiz paylaşma. Telif hakkı ihlali bildirimlerini <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> adresine gönderebilirsin.
      </p>

      <h2>5. Kurallar</h2>
      <p>
        Herkesin güvende hissetmesi için <Link href="/legal/topluluk-kurallari">Topluluk Kuralları</Link>&apos;na uymalısın. Zorbalık, taciz, çıplaklık, şiddet, nefret söylemi, kendine zarar vermeyi özendirme, yasa dışı içerik, kimlik taklidi ve spam yasaktır.
      </p>

      <h2>6. Şikayet, engelleme ve önlemler</h2>
      <ul>
        <li>Rahatsız olduğun hesapları engelleyebilirsin.</li>
        <li>İçerik şikayet özelliği beta sürümüyle birlikte gelecektir. O zamana kadar bize e-posta ile ulaşabilirsin.</li>
        <li>Kurallara aykırı içeriği kaldırma, hesabı kısıtlama veya kapatma hakkımızı saklı tutarız. Ağır ihlallerde yetkili makamlara bildirimde bulunabiliriz.</li>
      </ul>

      <h2>7. Mesajlar</h2>
      <p>
        Mesajlar uçtan uca şifreli <strong>değildir</strong>. Erişim kurallarıyla korunur; ancak şikayet edildiğinde veya yasal bir zorunluluk olduğunda incelenebilir. Ayrıntılar için <Link href="/legal/gizlilik">Gizlilik Politikası</Link>&apos;na bak.
      </p>

      <h2>8. Hizmetin kullanımı</h2>
      <ul>
        <li>Uygulamayı bozmaya, yetkisiz erişmeye, otomatik araçlarla veri toplamaya çalışma.</li>
        <li>Shovrum beta aşamasındadır; özellikler değişebilir, kesintiler yaşanabilir.</li>
      </ul>

      <h2>9. Sorumluluk</h2>
      <p>
        Hizmet &quot;olduğu gibi&quot; sunulur. Kullanıcıların paylaştığı içeriklerden doğrudan sorumlu değiliz; ancak bildirim aldığımızda gerekli adımları atarız. Kanunların izin verdiği ölçüde, hizmetin kullanımından doğan dolaylı zararlardan sorumlu tutulamayız.
      </p>

      <h2>10. Hesabını kapatma</h2>
      <p>
        Hesabını ve verilerini silmek için bize <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> adresinden yaz; uygulama içi hesap silme özelliği hazırlanmaktadır.
      </p>

      <h2>11. Değişiklikler ve uygulanacak hukuk</h2>
      <p>
        Bu şartları güncelleyebiliriz; önemli değişiklikleri uygulama içinde duyururuz. Bu şartlara Türkiye Cumhuriyeti hukuku uygulanır.
      </p>

      <h2>12. İletişim</h2>
      <p>
        {LEGAL_CONTROLLER_NAME} · <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
      </p>
    </LegalDoc>
  );
}
