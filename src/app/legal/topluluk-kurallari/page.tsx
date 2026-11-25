import Link from "next/link";
import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/LegalDoc";
import { SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/config/site";

export const metadata: Metadata = { title: "Topluluk Kuralları" };

export default function CommunityGuidelinesPage() {
  return (
    <LegalDoc title="Topluluk Kuralları">
      <p>
        Shovrum, birçok kişinin gençlerden yetişkinlere birlikte vakit geçirdiği bir yer. Herkesin kendini güvende hissetmesi için bu kurallara uymanı bekliyoruz.
      </p>

      <h2>Yapma</h2>
      <ul>
        <li><strong>Zorbalık ve taciz:</strong> Kimseyi aşağılama, tehdit etme, ısrarla rahatsız etme, birini dışlamaya çağırma.</li>
        <li><strong>Çıplaklık ve cinsel içerik:</strong> Müstehcen veya cinsel içerik paylaşma. Reşit olmayanları içeren her türlü cinsel içerik kesinlikle yasaktır ve yetkililere bildirilir.</li>
        <li><strong>Şiddet:</strong> Şiddeti öven, özendiren veya aşırı rahatsız edici görüntüleri paylaşma.</li>
        <li><strong>Nefret söylemi:</strong> Irk, din, cinsiyet, yönelim, engel veya köken nedeniyle kişi ya da gruplara saldırma.</li>
        <li><strong>Kendine zarar verme:</strong> Kendine zarar vermeyi, yeme bozukluklarını veya intiharı özendirme. Zor bir dönemden geçiyorsan güvendiğin bir yetişkine ya da bir uzmana ulaşmanı öneririz.</li>
        <li><strong>Yasa dışı içerik:</strong> Uyuşturucu, silah satışı, dolandırıcılık ve benzeri suç teşkil eden her şey.</li>
        <li><strong>Kimlik taklidi:</strong> Başka birinin ya da bir markanın adına hesap açma, sahte profil kullanma.</li>
        <li><strong>Spam:</strong> Toplu, tekrarlayan veya yanıltıcı mesaj, bağlantı ve takip istekleri gönderme.</li>
        <li><strong>Özel bilgi:</strong> Başkasının adresini, telefonunu, fotoğrafını veya özel yazışmasını izinsiz paylaşma.</li>
      </ul>

      <h2>Yap</h2>
      <ul>
        <li>Saygılı ol; katılmasan bile saygıyla ifade et.</li>
        <li>Başkalarının görüntüsünü paylaşmadan önce izin al.</li>
        <li>18 yaşından küçükse güvenliğin için kişisel bilgilerini (adres, okul, telefon) herkese açık paylaşma.</li>
      </ul>

      <h2>Engelleme ve şikayet</h2>
      <ul>
        <li><strong>Engelle:</strong> Bir profilden o hesabı engelleyebilirsin; engellediğin hesap seni göremez ve sana yazamaz.</li>
        <li><strong>Şikayet:</strong> İçerik ve hesap şikayeti beta sürümüyle birlikte gelecek. O zamana kadar sorun bildirmek için <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> adresine yazabilirsin.</li>
        <li><strong>Gizli hesap:</strong> Ayarlar&apos;dan hesabını gizli yapıp kimin seni takip edebileceğini sen seçebilirsin.</li>
      </ul>

      <h2>Kuralları ihlal edersen</h2>
      <p>
        İhlalin ağırlığına göre içeriğin kaldırılabilir, hesabın kısıtlanabilir veya kapatılabilir. Yasa dışı durumlarda yetkili makamlara bildirimde bulunabiliriz.
      </p>

      <p>
        Daha fazlası için <Link href="/legal/kullanim-sartlari">Kullanım Şartları</Link> ve <Link href="/legal/gizlilik">Gizlilik Politikası</Link>&apos;na göz atabilirsin.
      </p>
    </LegalDoc>
  );
}
