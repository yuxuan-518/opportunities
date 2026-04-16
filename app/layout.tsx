import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Opportunities & Programs | For High School Students',
  description: 'Discover curated extracurricular opportunities for high school students — competitions, internships, scholarships, research programs, and more.',
  keywords: 'high school opportunities, extracurricular activities, scholarships, internships, competitions, research programs, college prep',
  openGraph: {
    title: 'Opportunities & Programs | For High School Students',
    description: 'Discover curated extracurricular opportunities for high school students — competitions, internships, scholarships, research programs, and more.',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta name="robots" content="index, follow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}