import Link from "next/link";

/** Kayıt ekranlarında rıza/yaş onayı satırı (A-08). */
export default function ConsentLine({ className = "" }: { className?: string }) {
  const link = "text-zinc-300 underline underline-offset-2 hover:text-white";
  return (
    <p className={`text-[11px] leading-relaxed text-zinc-500 text-center ${className}`}>
      Devam ederek{" "}
      <Link href="/legal/kullanim-sartlari" className={link}>
        Kullanım Şartları
      </Link>
      &apos;nı ve{" "}
      <Link href="/legal/gizlilik" className={link}>
        Gizlilik Politikası
      </Link>
      &apos;nı kabul etmiş olursun; 13 yaşından büyük olduğunu onaylarsın.
    </p>
  );
}
