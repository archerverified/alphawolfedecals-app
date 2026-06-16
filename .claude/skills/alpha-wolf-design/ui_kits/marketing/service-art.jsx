// Per-service art for the homepage services grid — real install photos
// from the shop's gallery (lib/gallery.ts in archerverified/AlphaWolfDecals).
// Each image is the literal output of the service the card promotes.

const SERVICE_PHOTO = {
  'vinyl-wraps':           { src: '../../assets/gallery/14.jpg', alt: 'Buick Enclave Avenir after a green-shift vinyl wrap, parked at the shop.' },
  'commercial-wraps':      { src: '../../assets/gallery/15.jpg', alt: 'ChemDry of Corvallis fleet van — full-body commercial wrap from the install bay.' },
  'vehicle-tint':          { src: '../../assets/gallery/16.jpg', alt: 'Toyota Tundra TRD Pro with ceramic window tint installed.' },
  'paint-protection-film': { src: '../../assets/gallery/17.jpg', alt: 'Tesla Model 3 hood mid-install with PPF / clear-bra slip-water on the surface.' },
  'color-change-wraps':    { src: '../../assets/gallery/09.jpg', alt: '2022 Chevrolet Camaro RS after a satin plum color-change wrap.' },
  'storefronts-signage':   { src: '../../assets/gallery/25.jpg', alt: "Ohana's Barbershop — custom storefront window vinyl and channel-letter sign." },
};

function ServiceArt({ slug }) {
  const photo = SERVICE_PHOTO[slug] || SERVICE_PHOTO['vinyl-wraps'];
  return (
    <div aria-hidden="true" style={{ position: 'relative', aspectRatio: '4/3', width: '100%', overflow: 'hidden', background: '#0A0A0A' }}>
      <img
        src={photo.src}
        alt={photo.alt}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
    </div>
  );
}

Object.assign(window, { ServiceArt, SERVICE_PHOTO });
