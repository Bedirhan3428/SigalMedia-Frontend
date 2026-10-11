"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";

const ITEM_HEIGHT = 44; // px
const VISIBLE_COUNT = 5; // 2 yukari, 1 orta, 2 asagi
const PADDING_Y = 88; // ITEM_HEIGHT * 2

interface WheelColumnProps<T> {
  items: T[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  formatLabel: (item: T) => string;
}

function WheelColumn<T>({
  items,
  selectedIndex,
  onSelect,
  formatLabel,
}: WheelColumnProps<T>) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isProgrammaticScrollRef = useRef(false);

  // Belirli bir indekse kaydır
  const scrollToIndex = useCallback((index: number, smooth = true) => {
    if (!containerRef.current) return;
    isProgrammaticScrollRef.current = true;
    containerRef.current.scrollTo({
      top: index * ITEM_HEIGHT,
      behavior: smooth ? "smooth" : "instant",
    });
    setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, 200);
  }, []);

  // İlk yüklemede ve prop değiştiğinde ortala
  useEffect(() => {
    scrollToIndex(selectedIndex, false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Dışarıdan gelen selectedIndex güncellenirse
  useEffect(() => {
    if (containerRef.current) {
      const currentScrollIndex = Math.round(
        containerRef.current.scrollTop / ITEM_HEIGHT
      );
      if (currentScrollIndex !== selectedIndex) {
        scrollToIndex(selectedIndex, true);
      }
    }
  }, [selectedIndex, scrollToIndex]);

  const handleScroll = () => {
    if (isProgrammaticScrollRef.current) return;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      if (!containerRef.current) return;
      const top = containerRef.current.scrollTop;
      const index = Math.round(top / ITEM_HEIGHT);
      const clampedIndex = Math.max(0, Math.min(items.length - 1, index));

      if (clampedIndex !== selectedIndex) {
        onSelect(clampedIndex);
      }
    }, 90);
  };

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 h-[220px] overflow-y-auto no-scrollbar snap-y snap-mandatory relative"
      style={{
        paddingTop: `${PADDING_Y}px`,
        paddingBottom: `${PADDING_Y}px`,
      }}
    >
      {items.map((item, idx) => {
        const isSelected = idx === selectedIndex;
        return (
          <div
            key={idx}
            onClick={() => {
              onSelect(idx);
              scrollToIndex(idx, true);
            }}
            className={`h-[44px] snap-center flex items-center justify-center cursor-pointer select-none transition-all duration-150 ${
              isSelected
                ? "text-white font-bold text-lg scale-105"
                : "text-zinc-600 font-medium text-sm hover:text-zinc-400"
            }`}
          >
            {formatLabel(item)}
          </div>
        );
      })}
    </div>
  );
}

const MONTHS = [
  { value: 1, label: "Ocak" },
  { value: 2, label: "Şubat" },
  { value: 3, label: "Mart" },
  { value: 4, label: "Nisan" },
  { value: 5, label: "Mayıs" },
  { value: 6, label: "Haziran" },
  { value: 7, label: "Temmuz" },
  { value: 8, label: "Ağustos" },
  { value: 9, label: "Eylül" },
  { value: 10, label: "Ekim" },
  { value: 11, label: "Kasım" },
  { value: 12, label: "Aralık" },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 90 }, (_, i) => currentYear - i); // 2026'dan geriye

interface DatePickerWheelProps {
  value: string; // "YYYY-MM-DD"
  onChange: (dateStr: string, age: number) => void;
}

export default function DatePickerWheel({ value, onChange }: DatePickerWheelProps) {
  // Varsayılan tarih parçaları
  const initialDate = value ? new Date(value) : new Date(2005, 5, 15);
  const initYear = !isNaN(initialDate.getFullYear()) ? initialDate.getFullYear() : 2005;
  const initMonth = !isNaN(initialDate.getMonth()) ? initialDate.getMonth() + 1 : 6;
  const initDay = !isNaN(initialDate.getDate()) ? initialDate.getDate() : 15;

  const [selectedYear, setSelectedYear] = useState<number>(initYear);
  const [selectedMonth, setSelectedMonth] = useState<number>(initMonth);
  const [selectedDay, setSelectedDay] = useState<number>(initDay);

  // Ayın kaç gün çektiğini hesapla
  const daysInMonth = new Date(selectedYear, selectedMonth, 0).getDate();
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Gün sayısı değiştiğinde taşmayı önle (örn: 31 Mart -> 28 Şubat)
  useEffect(() => {
    if (selectedDay > daysInMonth) {
      setSelectedDay(daysInMonth);
    }
  }, [daysInMonth, selectedDay]);

  // Değişiklik olduğunda dışarıya bildir
  useEffect(() => {
    const validDay = Math.min(selectedDay, daysInMonth);
    const dayStr = String(validDay).padStart(2, "0");
    const monthStr = String(selectedMonth).padStart(2, "0");
    const dateStr = `${selectedYear}-${monthStr}-${dayStr}`;

    const birth = new Date(dateStr);
    const today = new Date();
    let calculatedAge = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
      calculatedAge--;
    }

    onChange(dateStr, calculatedAge);
  }, [selectedDay, selectedMonth, selectedYear, daysInMonth, onChange]);

  const yearIndex = Math.max(0, YEARS.indexOf(selectedYear));
  const monthIndex = Math.max(0, selectedMonth - 1);
  const dayIndex = Math.max(0, Math.min(selectedDay - 1, DAYS.length - 1));

  return (
    <div className="relative w-full bg-zinc-900/90 border border-zinc-800/80 rounded-3xl overflow-hidden p-2 select-none">
      {/* Seçim Merceği (Aktif Satır Vurgusu) */}
      <div
        className="absolute left-3 right-3 h-[44px] pointer-events-none rounded-2xl bg-zinc-800/70 border border-zinc-700/50 shadow-inner z-0"
        style={{ top: `${PADDING_Y + 8}px` }}
      />

      {/* Üst ve Alt Gradyan Gölgeleri */}
      <div className="absolute top-0 left-0 right-0 h-16 bg-gradient-to-b from-zinc-900 via-zinc-900/80 to-transparent pointer-events-none z-10" />
      <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-zinc-900 via-zinc-900/80 to-transparent pointer-events-none z-10" />

      {/* Çark Sütunları */}
      <div className="flex items-center justify-between relative z-5">
        {/* Gün Çarkı */}
        <WheelColumn
          items={DAYS}
          selectedIndex={dayIndex}
          onSelect={(idx) => setSelectedDay(DAYS[idx])}
          formatLabel={(day) => String(day).padStart(2, "0")}
        />

        <div className="w-[1px] h-20 bg-zinc-800/40 z-10 shrink-0" />

        {/* Ay Çarkı */}
        <WheelColumn
          items={MONTHS}
          selectedIndex={monthIndex}
          onSelect={(idx) => setSelectedMonth(MONTHS[idx].value)}
          formatLabel={(m) => m.label}
        />

        <div className="w-[1px] h-20 bg-zinc-800/40 z-10 shrink-0" />

        {/* Yıl Çarkı */}
        <WheelColumn
          items={YEARS}
          selectedIndex={yearIndex}
          onSelect={(idx) => setSelectedYear(YEARS[idx])}
          formatLabel={(y) => String(y)}
        />
      </div>
    </div>
  );
}
