export const metadata = {
  title: 'Video Upscaler',
  description: 'Upscale videos in your browser using ffmpeg.wasm',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial' }}>
        {children}
      </body>
    </html>
  );
}
