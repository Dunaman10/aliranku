import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import { id as localeId } from 'date-fns/locale'
import { type Account, type Category, type Tx } from '../db'
import { type Period, fmtDate } from './dates'
import { formatIDR } from './money'

export interface PDFExportOptions {
  period: Period
  transactions: Tx[]
  accounts: Account[]
  categories: Category[]
  income: number
  expense: number
  accountFilterName?: string
  categoryFilterName?: string
}

export function exportReportPDF(opts: PDFExportOptions): void {
  const {
    period,
    transactions,
    accounts,
    categories,
    income,
    expense,
    accountFilterName,
    categoryFilterName,
  } = opts

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  })

  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 14

  const catMap = new Map<number, Category>(categories.map((c) => [c.id, c]))
  const accMap = new Map<number, Account>(accounts.map((a) => [a.id, a]))

  // 1. Header Banner / Background Top
  doc.setFillColor(15, 118, 110) // Teal 700
  doc.rect(0, 0, pageWidth, 28, 'F')

  // Judul Aplikasi & Subjudul
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(16)
  doc.text('ALIRANKU', margin, 12)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.text('Laporan Catatan Keuangan Pribadi', margin, 17)

  // Tanggal Cetak (Kanan Atas Header)
  doc.setFontSize(8)
  doc.text(
    `Dicetak: ${format(new Date(), 'd MMMM yyyy HH:mm', { locale: localeId })}`,
    pageWidth - margin,
    14,
    { align: 'right' },
  )

  // 2. Info Periode & Filter Info Box
  let currentY = 36

  doc.setTextColor(30, 41, 59) // Slate 800
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13)

  const kindLabel =
    period.kind === 'weekly'
      ? 'Laporan Mingguan'
      : period.kind === 'monthly'
        ? 'Laporan Bulanan'
        : 'Laporan Tahunan'

  doc.text(`${kindLabel}: ${period.label}`, margin, currentY)

  currentY += 5
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139) // Slate 500

  const filterNotes: string[] = []
  if (accountFilterName && accountFilterName !== 'Semua akun') {
    filterNotes.push(`Akun: ${accountFilterName}`)
  }
  if (categoryFilterName && categoryFilterName !== 'Semua kategori') {
    filterNotes.push(`Kategori: ${categoryFilterName}`)
  }
  filterNotes.push(`Total Transaksi: ${transactions.length}`)

  doc.text(filterNotes.join('   |   '), margin, currentY)

  // 3. Ringkasan Keuangan (3 Cards Summary)
  currentY += 8
  const cardWidth = (pageWidth - margin * 2 - 8) / 3
  const cardHeight = 20
  const net = income - expense

  // Card 1: Pemasukan
  doc.setFillColor(240, 253, 244) // Emerald 50
  doc.setDrawColor(187, 247, 208) // Emerald 200
  doc.roundedRect(margin, currentY, cardWidth, cardHeight, 2, 2, 'FD')

  doc.setTextColor(22, 101, 52) // Emerald 800
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('TOTAL PEMASUKAN', margin + 4, currentY + 6)
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'bold')
  doc.text(formatIDR(income), margin + 4, currentY + 14)

  // Card 2: Pengeluaran
  const card2X = margin + cardWidth + 4
  doc.setFillColor(255, 241, 242) // Rose 50
  doc.setDrawColor(254, 205, 211) // Rose 200
  doc.roundedRect(card2X, currentY, cardWidth, cardHeight, 2, 2, 'FD')

  doc.setTextColor(159, 18, 57) // Rose 800
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text('TOTAL PENGELUARAN', card2X + 4, currentY + 6)
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'bold')
  doc.text(formatIDR(expense), card2X + 4, currentY + 14)

  // Card 3: Arus Kas Bersih (Surplus / Defisit)
  const card3X = card2X + cardWidth + 4
  if (net >= 0) {
    doc.setFillColor(236, 253, 245) // Teal 50
    doc.setDrawColor(167, 243, 208) // Teal 200
    doc.setTextColor(15, 118, 110)
  } else {
    doc.setFillColor(254, 242, 242)
    doc.setDrawColor(254, 202, 202)
    doc.setTextColor(185, 28, 28)
  }
  doc.roundedRect(card3X, currentY, cardWidth, cardHeight, 2, 2, 'FD')

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(net >= 0 ? 'SURPLUS (BERSIH)' : 'DEFISIT (BERSIH)', card3X + 4, currentY + 6)
  doc.setFontSize(10.5)
  doc.setFont('helvetica', 'bold')
  doc.text(formatIDR(Math.abs(net)), card3X + 4, currentY + 14)

  currentY += cardHeight + 8

  // 4. Tabel Ringkasan Pengeluaran Per Kategori (jika ada pengeluaran)
  const expenseByCategory = new Map<string, { nature: string; total: number }>()
  for (const t of transactions) {
    if (t.type !== 'expense') continue
    const cat = t.categoryId ? catMap.get(t.categoryId) : undefined
    const catName = cat?.name ?? 'Tanpa Kategori'
    const nature = cat?.nature === 'need' ? 'Kebutuhan' : cat?.nature === 'want' ? 'Keinginan' : '-'
    const current = expenseByCategory.get(catName) ?? { nature, total: 0 }
    current.total += t.amount
    expenseByCategory.set(catName, current)
  }

  if (expenseByCategory.size > 0 && expense > 0) {
    doc.setTextColor(30, 41, 59)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.text('Komposisi Pengeluaran per Kategori', margin, currentY)
    currentY += 2

    const catRows = [...expenseByCategory.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, data], idx) => {
        const pct = ((data.total / expense) * 100).toFixed(1) + '%'
        return [
          String(idx + 1),
          name,
          data.nature,
          formatIDR(data.total),
          pct,
        ]
      })

    autoTable(doc, {
      startY: currentY,
      head: [['No', 'Kategori', 'Tipe', 'Nominal', 'Porsi (%)']],
      body: catRows,
      theme: 'grid',
      headStyles: {
        fillColor: [15, 118, 110],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 8,
        halign: 'left',
      },
      styles: {
        fontSize: 8,
        cellPadding: 2,
        textColor: [51, 65, 85],
      },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 28, halign: 'center' },
        3: { cellWidth: 35, halign: 'right' },
        4: { cellWidth: 22, halign: 'right' },
      },
      margin: { left: margin, right: margin },
    })

    // Update currentY after table
    currentY = (doc as any).lastAutoTable.finalY + 8
  }

  // 5. Tabel Rincian Semua Transaksi
  // Sort transactions by date descending, then createdAt descending
  const sortedTxs = [...transactions].sort((a, b) => {
    if (a.date !== b.date) return b.date.localeCompare(a.date)
    return (b.createdAt || 0) - (a.createdAt || 0)
  })

  // Cek apakah sisa halaman cukup untuk judul tabel transaksi
  if (currentY > pageHeight - 35) {
    doc.addPage()
    currentY = 20
  }

  doc.setTextColor(30, 41, 59)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text('Daftar Rincian Transaksi', margin, currentY)
  currentY += 2

  const txRows = sortedTxs.map((t, idx) => {
    const formattedDate = fmtDate(t.date, 'dd/MM/yyyy')
    const acc = accMap.get(t.accountId)?.name ?? '-'
    let typeLabel = 'Pengeluaran'
    let catOrAcc = t.categoryId ? (catMap.get(t.categoryId)?.name ?? '-') : '-'

    if (t.type === 'income') {
      typeLabel = 'Pemasukan'
    } else if (t.type === 'transfer') {
      typeLabel = 'Transfer'
      const toAcc = t.toAccountId ? (accMap.get(t.toAccountId)?.name ?? '-') : '-'
      catOrAcc = `Ke: ${toAcc}`
    }

    const note = t.note ? t.note.trim() : '-'

    return [
      String(idx + 1),
      formattedDate,
      typeLabel,
      catOrAcc,
      acc,
      note,
      formatIDR(t.amount),
    ]
  })

  autoTable(doc, {
    startY: currentY,
    head: [['No', 'Tanggal', 'Tipe', 'Kategori / Tujuan', 'Akun Sumber', 'Catatan', 'Nominal']],
    body: txRows.length > 0 ? txRows : [['-', '-', '-', '-', '-', 'Tidak ada transaksi', '-']],
    theme: 'striped',
    headStyles: {
      fillColor: [51, 65, 85], // Slate 700
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'left',
    },
    styles: {
      fontSize: 7.5,
      cellPadding: 2,
      textColor: [51, 65, 85],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 20, halign: 'center' },
      2: { cellWidth: 22 },
      3: { cellWidth: 32 },
      4: { cellWidth: 25 },
      5: { cellWidth: 'auto' },
      6: { cellWidth: 28, halign: 'right' },
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252], // Slate 50
    },
    margin: { left: margin, right: margin, bottom: 18 },
    didParseCell: (hookData) => {
      // Pewarnaan teks tipe transaksi & nominal
      if (hookData.section === 'body' && txRows.length > 0) {
        const rowIndex = hookData.row.index
        const tx = sortedTxs[rowIndex]
        if (!tx) return

        if (hookData.column.index === 2 || hookData.column.index === 6) {
          if (tx.type === 'income') {
            hookData.cell.styles.textColor = [22, 101, 52] // Green
            hookData.cell.styles.fontStyle = 'bold'
          } else if (tx.type === 'expense') {
            hookData.cell.styles.textColor = [190, 18, 60] // Rose
          } else if (tx.type === 'transfer') {
            hookData.cell.styles.textColor = [3, 105, 161] // Sky
          }
        }
      }
    },
  })

  // 6. Footer (Penomoran Halaman di setiap page)
  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7.5)
    doc.setTextColor(148, 163, 184) // Slate 400

    // Footer line
    doc.setDrawColor(226, 232, 240)
    doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12)

    doc.text('Aliranku – Aplikasi Catatan Keuangan Pribadi', margin, pageHeight - 8)
    doc.text(`Halaman ${i} dari ${totalPages}`, pageWidth - margin, pageHeight - 8, {
      align: 'right',
    })
  }

  // Simpan file PDF
  const dateStr = format(period.start, 'yyyyMMdd')
  const fileName = `Aliranku_Laporan_${period.kind}_${dateStr}.pdf`
  doc.save(fileName)
}
