import './globals.css'

export const metadata = {
    title: 'AdventureWorks Agent',
    description: 'Chat with the AdventureWorks Agent',
}

export default function RootLayout({
    children,
}: {
    children: React.ReactNode
}) {
    return (
        <html lang="en">
            <body style={{ margin: 0, padding: 0, fontFamily: 'system-ui, sans-serif' }}>
                {children}
            </body>
        </html>
    )
}
