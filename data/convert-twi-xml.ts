/**
 * Converts the Asante Twi Bible XML into Manna's Bible JSON format.
 *
 * Usage:
 *   bun run data/convert-twi-xml.ts
 *   bun run data/convert-twi-xml.ts <input-url-or-file> <output-file>
 */

import * as cheerio from "cheerio"
import { mkdir } from "node:fs/promises"
import { dirname, join, resolve } from "node:path"

const DEFAULT_SOURCE =
  "https://raw.githubusercontent.com/Beblia/Holy-Bible-XML-Format/refs/heads/master/TwiAsanteBible.xml"
const DEFAULT_OUTPUT = join(import.meta.dir, "sources", "NA-TWI.json")

const BOOK_NAMES = [
  "Genesis",
  "Exodus",
  "Leviticus",
  "Numbers",
  "Deuteronomy",
  "Joshua",
  "Judges",
  "Ruth",
  "1 Samuel",
  "2 Samuel",
  "1 Kings",
  "2 Kings",
  "1 Chronicles",
  "2 Chronicles",
  "Ezra",
  "Nehemiah",
  "Esther",
  "Job",
  "Psalms",
  "Proverbs",
  "Ecclesiastes",
  "Song of Solomon",
  "Isaiah",
  "Jeremiah",
  "Lamentations",
  "Ezekiel",
  "Daniel",
  "Hosea",
  "Joel",
  "Amos",
  "Obadiah",
  "Jonah",
  "Micah",
  "Nahum",
  "Habakkuk",
  "Zephaniah",
  "Haggai",
  "Zechariah",
  "Malachi",
  "Matthew",
  "Mark",
  "Luke",
  "John",
  "Acts",
  "Romans",
  "1 Corinthians",
  "2 Corinthians",
  "Galatians",
  "Ephesians",
  "Philippians",
  "Colossians",
  "1 Thessalonians",
  "2 Thessalonians",
  "1 Timothy",
  "2 Timothy",
  "Titus",
  "Philemon",
  "Hebrews",
  "James",
  "1 Peter",
  "2 Peter",
  "1 John",
  "2 John",
  "3 John",
  "Jude",
  "Revelation",
] as const

const SOURCE_CORRECTIONS: Record<string, string> = {
  "Mark 6:23":
    "Herode de ntam ka kyerɛɛ ababaa no se, “Bisa me biribiara a wopɛ, sɛ m’aheman mu fa mpo na wopɛ koraa a, mede bɛma wo!”",
}

interface BibleJson {
  translation: string
  books: Array<{
    name: string
    chapters: Array<{
      chapter: number
      verses: Array<{ verse: number; text: string }>
    }>
  }>
}

function parseNumber(value: string | undefined, label: string): number {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new Error(`Invalid ${label}: ${value ?? "missing"}`)
  }
  return number
}

async function readSource(source: string): Promise<string> {
  if (/^https?:\/\//i.test(source)) {
    console.log(`Downloading ${source}`)
    const response = await fetch(source)
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status}`)
    }
    return response.text()
  }

  const file = Bun.file(resolve(source))
  if (!(await file.exists())) throw new Error(`Input file not found: ${source}`)
  return file.text()
}

function convert(xml: string): BibleJson {
  const $ = cheerio.load(xml, { xml: true })
  const bible = $("bible").first()
  if (bible.length === 0)
    throw new Error("Input does not contain a <bible> root")

  const translation = bible.attr("translation")?.trim()
  if (!translation)
    throw new Error("The <bible> root has no translation attribute")

  const booksByNumber = new Map<number, BibleJson["books"][number]>()

  bible.find("testament > book").each((_, bookElement) => {
    const book = $(bookElement)
    const bookNumber = parseNumber(book.attr("number"), "book number")
    const name = BOOK_NAMES[bookNumber - 1]
    if (!name) throw new Error(`Unsupported book number: ${bookNumber}`)
    if (booksByNumber.has(bookNumber)) {
      throw new Error(`Duplicate book number: ${bookNumber}`)
    }

    const chapters = book
      .children("chapter")
      .map((_, chapterElement) => {
        const chapter = $(chapterElement)
        const chapterNumber = parseNumber(
          chapter.attr("number"),
          `${name} chapter number`
        )
        const seenVerses = new Set<number>()
        const verses = chapter
          .children("verse")
          .map((_, verseElement) => {
            const verse = $(verseElement)
            const verseNumber = parseNumber(
              verse.attr("number"),
              `${name} ${chapterNumber} verse number`
            )
            if (seenVerses.has(verseNumber)) {
              throw new Error(
                `Duplicate verse: ${name} ${chapterNumber}:${verseNumber}`
              )
            }
            seenVerses.add(verseNumber)

            const reference = `${name} ${chapterNumber}:${verseNumber}`
            const text =
              verse.text().replace(/\s+/gu, " ").trim() ||
              SOURCE_CORRECTIONS[reference] ||
              ""
            return { verse: verseNumber, text }
          })
          .get()
          .sort((a, b) => a.verse - b.verse)

        if (verses.length === 0)
          throw new Error(`Empty chapter: ${name} ${chapterNumber}`)
        return { chapter: chapterNumber, verses }
      })
      .get()
      .sort((a, b) => a.chapter - b.chapter)

    if (chapters.length === 0) throw new Error(`Book has no chapters: ${name}`)
    booksByNumber.set(bookNumber, { name, chapters })
  })

  const missingBooks = BOOK_NAMES.filter(
    (_, index) => !booksByNumber.has(index + 1)
  )
  if (missingBooks.length > 0) {
    throw new Error(`Missing books: ${missingBooks.join(", ")}`)
  }

  return {
    translation,
    books: BOOK_NAMES.map((_, index) => booksByNumber.get(index + 1)!),
  }
}

async function main(): Promise<void> {
  const source = process.argv[2] ?? DEFAULT_SOURCE
  const output = resolve(process.argv[3] ?? DEFAULT_OUTPUT)
  const result = convert(await readSource(source))
  const chapterCount = result.books.reduce(
    (sum, book) => sum + book.chapters.length,
    0
  )
  const verseCount = result.books.reduce(
    (sum, book) =>
      sum +
      book.chapters.reduce(
        (bookSum, chapter) => bookSum + chapter.verses.length,
        0
      ),
    0
  )
  const emptyVerses = result.books.flatMap((book) =>
    book.chapters.flatMap((chapter) =>
      chapter.verses
        .filter((verse) => !verse.text)
        .map((verse) => `${book.name} ${chapter.chapter}:${verse.verse}`)
    )
  )

  await mkdir(dirname(output), { recursive: true })
  await Bun.write(output, `${JSON.stringify(result, null, 2)}\n`)

  console.log(`Wrote ${output}`)
  console.log(
    `${result.books.length} books, ${chapterCount} chapters, ${verseCount} verses`
  )
  if (emptyVerses.length > 0) {
    console.warn(
      `Warning: source contains empty verses: ${emptyVerses.join(", ")}`
    )
  }
}

main().catch((error) => {
  console.error(
    `Conversion failed: ${error instanceof Error ? error.message : error}`
  )
  process.exit(1)
})
