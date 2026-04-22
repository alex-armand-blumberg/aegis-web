export default function Head() {
  return (
    <>
      <link rel="preload" as="image" href="/earth-bg.png" fetchPriority="high" />
      <link rel="preload" as="video" href="/hero-bg.mp4" type="video/mp4" />
    </>
  );
}
