import type { Metadata } from "next";
import { LegalDoc } from "@/components/legal/LegalDoc";
import { LEGAL_CONTROLLER_NAME, SUPPORT_EMAIL, SUPPORT_MAILTO } from "@/lib/config/site";

export const metadata: Metadata = { title: "Gizlilik ve KVKK" };

export default function PrivacyPage() {
  return (
    <LegalDoc title="Gizlilik Politikası ve KVKK Aydınlatma Metni">
      <p>
        Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu (&quot;KVKK&quot;) m.10 uyarınca, Shovrum&apos;u kullanırken kişisel verilerinin nasıl işlendiğini anlatır.
      </p>

      <h2>1. Veri sorumlusu</h2>
      <p>
        <strong>{LEGAL_CONTROLLER_NAME}</strong> · İletişim: <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a>
      </p>

      <h2>2. Hangi verileri işliyoruz?</h2>
      <ul>
        <li><strong>Hesap:</strong> e-posta adresi, kullanıcı adı, şifre (şifrelenmiş saklanır), doğum tarihi/yaş bilgisi, giriş yöntemi (e-posta veya Google).</li>
        <li><strong>Profil:</strong> görünen ad, biyografi, profil fotoğrafı, gizli hesap tercihi.</li>
        <li><strong>İçerik:</strong> paylaştığın gönderi, Reels, hikaye, fotoğraf, video, müzik seçimi, beğeniler, takip ve engelleme ilişkileri.</li>
        <li><strong>Mesajlar:</strong> gönderdiğin ve aldığın mesajlar, paylaşılan gönderiler, okundu ve çevrimiçi durumu (ayarlardan kapatılabilir).</li>
        <li><strong>Teknik veriler:</strong> cihaz ve tarayıcı bilgisi, IP adresi, hata kayıtları, bildirim (push) abonelik bilgisi (izin verirsen).</li>
      </ul>
      <p>
        <strong>Önemli:</strong> Mesajların uçtan uca şifreli <strong>değildir</strong>. Erişim denetimleriyle korunur; ancak bir mesaj şikayet edildiğinde, güvenlik gerektirdiğinde veya yasal bir yükümlülük olduğunda incelenebilir.
      </p>

      <h2>3. İşleme amaçları</h2>
      <ul>
        <li>Hesabını oluşturmak, kimliğini doğrulamak ve hizmeti sunmak.</li>
        <li>İçeriklerini barındırmak, akışta göstermek, mesajlaşmayı sağlamak.</li>
        <li>Güvenliği sağlamak; kötüye kullanım, spam ve kural ihlallerini önlemek.</li>
        <li>Bildirim göndermek (izin verdiysen).</li>
        <li>Yasal yükümlülükleri yerine getirmek ve taleplere yanıt vermek.</li>
      </ul>

      <h2>4. Hukuki sebepler (KVKK m.5)</h2>
      <ul>
        <li>Sözleşmenin kurulması ve ifası (m.5/2-c): hesap ve hizmetin sunulması.</li>
        <li>Hukuki yükümlülük (m.5/2-ç): yasal talepler ve kayıt yükümlülükleri.</li>
        <li>Meşru menfaat (m.5/2-f): güvenlik, kötüye kullanımın önlenmesi, hizmetin geliştirilmesi.</li>
        <li>Açık rıza (m.5/1): push bildirimleri gibi isteğe bağlı işlemler; rızanı istediğin an geri alabilirsin.</li>
      </ul>

      <h2>5. Çocuklar ve gençler</h2>
      <p>
        Hizmet en az 13 yaşındakilere yöneliktir. 18 yaşından küçüklerin kullanımı ebeveyn veya velinin bilgisi dahilinde olmalıdır. 13 yaşından küçük birine ait hesap tespit edersek hesabı ve verileri sileriz. Ebeveyn veya veli olarak talepte bulunmak için <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> adresine yazabilirsin.
      </p>

      <h2>6. Verilerin aktarıldığı taraflar ve konumlar</h2>
      <p>Hizmeti sağlamak için aşağıdaki hizmet sağlayıcıları (veri işleyen) kullanıyoruz:</p>
      <ul>
        <li><strong>Supabase:</strong> veritabanı ve kimlik doğrulama (AB / Frankfurt).</li>
        <li><strong>Cloudflare R2:</strong> fotoğraf ve video gibi medya dosyalarının depolanması.</li>
        <li><strong>Vercel:</strong> uygulamanın barındırılması.</li>
        <li><strong>Geçiş dönemi:</strong> Taşıma tamamlanana kadar bazı veriler Firebase / Google altyapısında da işlenmektedir.</li>
      </ul>
      <p>
        Bu hizmet sağlayıcıların bir kısmı yurt dışında bulunduğundan, verilerin yurt dışına aktarımı KVKK m.9 kapsamında yapılır. Verilerini reklam amacıyla üçüncü taraflara satmayız.
      </p>

      <h2>7. Saklama süresi</h2>
      <ul>
        <li>Hesap ve içerik verileri, hesabın açık olduğu süre boyunca saklanır.</li>
        <li>Hesabını sildiğinde verilerin makul bir süre içinde (yedekler dahil en geç 30 gün) silinir veya anonim hale getirilir.</li>
        <li>Güvenlik kayıtları ve yasal olarak saklanması gereken veriler, ilgili mevzuatın öngördüğü süre kadar tutulur.</li>
      </ul>

      <h2>8. Haklarınız (KVKK m.11)</h2>
      <p>Veri sahibi olarak şunları isteyebilirsin:</p>
      <ul>
        <li>Verilerinin işlenip işlenmediğini öğrenmek ve bilgi talep etmek,</li>
        <li>İşleme amacını ve amaca uygun kullanılıp kullanılmadığını öğrenmek,</li>
        <li>Yurt içinde veya yurt dışında aktarıldığı tarafları öğrenmek,</li>
        <li>Eksik veya yanlış işlenmişse düzeltilmesini istemek,</li>
        <li>KVKK m.7 çerçevesinde silinmesini veya yok edilmesini istemek ve bunun aktarıldığı taraflara bildirilmesini talep etmek,</li>
        <li>İşlenen verilerin otomatik sistemlerle analiziyle aleyhine bir sonuç çıkmasına itiraz etmek,</li>
        <li>Kanuna aykırı işlenmesi nedeniyle zarara uğramışsan zararın giderilmesini talep etmek.</li>
      </ul>
      <p>
        Başvurularını <a href={SUPPORT_MAILTO}>{SUPPORT_EMAIL}</a> adresine iletebilirsin; en geç 30 gün içinde yanıtlarız.
      </p>

      <h2>9. Hesap ve veri silme</h2>
      <p>
        Hesabını ve verilerini silmek için yukarıdaki e-posta adresine yaz. Uygulama içinden hesap silme özelliği hazırlanmaktadır.
      </p>

      <h2>10. Güvenlik</h2>
      <p>
        Verilerini yetkisiz erişime karşı erişim denetimleri ve şifreli bağlantılar (HTTPS) ile koruruz. Hiçbir sistemin tamamen risksiz olmadığını hatırlatırız; güçlü bir şifre kullanman ve şifreni paylaşmaman önemlidir.
      </p>

      <h2>11. Değişiklikler</h2>
      <p>
        Bu metni güncelleyebiliriz. Önemli değişiklikleri uygulama içinde duyururuz. Güncel sürüm her zaman bu sayfadadır.
      </p>
    </LegalDoc>
  );
}
