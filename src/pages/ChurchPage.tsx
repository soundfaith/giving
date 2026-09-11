import { useEffect, useState, type ChangeEvent, type DragEvent, type FormEvent } from "react";
import { ArrowUpRight, Check, FileText, ImagePlus, X } from "lucide-react";
import {
  attachProjectPhotos,
  createChurchOrganization,
  getProjectPhotoUrl,
  submitChurchProject,
  uploadProjectPhoto,
} from "../lib/churches";
import { projectCategories } from "../lib/projects";
import { getBrowserWalletAddress } from "../lib/walletVault";

const draftKey = "soundfaith-create-project-draft";

type FormState = {
  name: string;
  churchName: string;
  title: string;
  location: string;
  country: string;
  description: string;
  goalTx: string;
  category: (typeof projectCategories)[number];
};

type SavedPhoto = { name: string; type: string; dataUrl: string };
type Draft = FormState & { photos: SavedPhoto[]; bannerIndex: number; attested: boolean; acceptedTerms: boolean };

const emptyForm: FormState = {
  name: "",
  churchName: "",
  title: "",
  location: "",
  country: "United States",
  description: "",
  goalTx: "",
  category: "Sound & AV",
};

function readDraft(): Draft {
  try {
    return { ...emptyForm, photos: [], bannerIndex: 0, attested: false, acceptedTerms: false, ...JSON.parse(localStorage.getItem(draftKey) ?? "{}") };
  } catch {
    return { ...emptyForm, photos: [], bannerIndex: 0, attested: false, acceptedTerms: false };
  }
}

function fileToSavedPhoto(file: File): Promise<SavedPhoto> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, 1200 / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({ name: file.name, type: "image/jpeg", dataUrl: canvas.toDataURL("image/jpeg", 0.78) });
      };
      image.onerror = () => reject(new Error("Unable to read this image."));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function savedPhotoToFile(photo: SavedPhoto) {
  const [header, encoded] = photo.dataUrl.split(",");
  const bytes = Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  return new File([bytes], photo.name, { type: header.match(/data:(.*?);/)?.[1] ?? photo.type });
}

export function ChurchPage({ authenticated, onSignIn }: { authenticated: boolean; onSignIn: () => void }) {
  const [draft, setDraft] = useState<Draft>(readDraft);
  const [dragging, setDragging] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      setMessage("Your text is saved, but these images are too large for this browser's local draft storage.");
    }
  }, [draft]);

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  const addPhotos = async (files: File[]) => {
    setMessage("");
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (images.length !== files.length) setMessage("Please choose image files only.");
    if (draft.photos.length + images.length > 3) {
      setMessage("Only 3 photos are allowed. Remove an existing image before adding another.");
      return;
    }
    try {
      const saved = await Promise.all(images.map(fileToSavedPhoto));
      setDraft((current) => ({ ...current, photos: [...current.photos, ...saved] }));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to add these images.");
    }
  };

  const handleFiles = (event: ChangeEvent<HTMLInputElement>) => {
    void addPhotos(Array.from(event.target.files ?? []));
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    void addPhotos(Array.from(event.dataTransfer.files));
  };

  const removePhoto = (index: number) => {
    setDraft((current) => ({ ...current, photos: current.photos.filter((_, photoIndex) => photoIndex !== index), bannerIndex: current.bannerIndex === index ? 0 : current.bannerIndex > index ? current.bannerIndex - 1 : current.bannerIndex }));
  };

  const formReady = Boolean(
    draft.name.trim() &&
    draft.churchName.trim() &&
    draft.title.trim() &&
    draft.location.trim() &&
    draft.country.trim() &&
    draft.description.trim() &&
    draft.goalTx &&
    Number(draft.goalTx) > 0 &&
    draft.attested &&
    draft.acceptedTerms,
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setMessage("");
    if (!draft.name.trim() || !draft.churchName.trim() || !draft.title.trim() || !draft.location.trim() || !draft.country.trim() || !draft.description.trim() || !draft.goalTx || Number(draft.goalTx) <= 0) {
      setMessage("Complete the required project details before submitting.");
      return;
    }
    if (!draft.attested || !draft.acceptedTerms) {
      setMessage("Confirm the legal attestation and terms before submitting.");
      return;
    }
    setLoading(true);
    try {
      const ownerWalletAddress = await getBrowserWalletAddress();
      if (!ownerWalletAddress) throw new Error("Create or import a wallet before submitting a project.");
      const organization = await createChurchOrganization(draft.name.trim());
      const project = await submitChurchProject({
        organizationId: organization.id,
        title: draft.title.trim(),
        churchName: draft.churchName.trim(),
        location: draft.location.trim(),
        country: draft.country.trim(),
        description: draft.description.trim(),
        category: draft.category,
        goalTx: Number(draft.goalTx),
        ownerWalletAddress,
      });
      const bannerIndex = Math.min(Math.max(draft.bannerIndex, 0), Math.max(draft.photos.length - 1, 0));
      const orderedPhotos = draft.photos.length ? [draft.photos[bannerIndex], ...draft.photos.filter((_, index) => index !== bannerIndex)] : [];
      const photoPaths = await Promise.all(orderedPhotos.map((photo) => uploadProjectPhoto(project.id, savedPhotoToFile(photo))));
      await attachProjectPhotos(project.id, photoPaths.map(getProjectPhotoUrl));
      localStorage.removeItem(draftKey);
      setSubmitted(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit project.");
    } finally {
      setLoading(false);
    }
  };

  if (!authenticated) {
    return <main className="church-route section-wrap"><p className="eyebrow">For churches</p><h1>Make room<br /><em>for more.</em></h1><p className="hero-description">Sign in to save and submit a project for your community.</p><button className="button button-coral" onClick={onSignIn}>Sign in to begin <ArrowUpRight size={16} /></button></main>;
  }

  if (submitted) {
    return <main className="church-page section-wrap"><div className="modal-backdrop" role="presentation"><section className="modal confirmation" role="dialog" aria-modal="true" aria-labelledby="project-submitted-title"><div className="confirmation-icon"><Check size={27} /></div><p className="eyebrow">Project submitted</p><h2 id="project-submitted-title">We’ll review<br /><em>your project.</em></h2><p className="modal-copy">Your project and images are saved for review. We’ll follow up if the review team needs more context.</p><button className="button button-dark modal-action" onClick={() => { window.location.hash = "#/"; }}>Done</button></section></div></main>;
  }

  return <main className="church-page section-wrap">
    <header className="church-page-heading"><div><p className="eyebrow">For churches · project submission</p><h1>Make room<br /><em>for more.</em></h1><p className="page-intro">Share the practical change your church wants to make. Clear details help the review team understand the need, the people it serves, and the impact your project can have.</p></div></header>
    <form className="church-page-form" onSubmit={(event) => void submit(event)}>
      <div className="country-field"><label>Country *<input required value={draft.country} onChange={(event) => update("country", event.target.value)} placeholder="United States" /></label></div>
      <section className="church-form-section"><div className="church-form-label"><span>01</span><div><p className="eyebrow">The basics</p><h2>Tell us about the project.</h2><p>These details give your application a clear starting point.</p></div></div><div className="church-form-grid"><label>Organization name *<input required value={draft.name} onChange={(event) => update("name", event.target.value)} placeholder="Your organization" /></label><label>Church name *<input required value={draft.churchName} onChange={(event) => update("churchName", event.target.value)} placeholder="The church or community" /></label><label>Project title *<input required value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="A short, clear project name" /></label><label>City, state *<input required value={draft.location} onChange={(event) => update("location", event.target.value)} placeholder="Austin, TX" /></label><label>Funding goal in USD *<input required className="goal-input" type="number" min="1" value={draft.goalTx} onChange={(event) => update("goalTx", event.target.value)} placeholder="15000" /></label><label>Project type<select value={draft.category} onChange={(event) => update("category", event.target.value as FormState["category"])}>{projectCategories.map((category) => <option key={category}>{category}</option>)}</select></label></div></section>
      <section className="church-form-section"><div className="church-form-label"><span>02</span><div><p className="eyebrow">The story</p><h2>Help people understand the need.</h2><p>Include the context, who benefits, and what the funding will make possible.</p></div></div><div><label className="church-description-label">Project description *<textarea required value={draft.description} onChange={(event) => update("description", event.target.value)} placeholder="What do you want to improve? Why does it matter now? Who will this help? What will be different when the project is complete?" /></label><p className="form-note"><FileText size={14} /> Relevant details, a simple budget explanation, and a clear picture of the community impact can help your project move through review.</p></div></section>
      <section className="church-form-section"><div className="church-form-label"><span>03</span><div><p className="eyebrow">The picture</p><h2>Show us the space.</h2><p>Add up to three photos. The banner image appears first on your project page.</p></div></div><div className="church-photo-workspace"><label className={dragging ? "church-upload-card dragging" : "church-upload-card"} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={handleDrop}><ImagePlus size={22} /><strong>Drop photos here or choose files</strong><small>JPG, PNG, or WebP · up to 3 images</small><input type="file" accept="image/*" multiple onChange={handleFiles} /></label>{draft.photos.length > 0 && <><div className="church-photo-previews">{draft.photos.map((photo, index) => <div className={index === draft.bannerIndex ? "church-photo-preview selected" : "church-photo-preview"} key={`${photo.name}-${index}`} role="button" tabIndex={0} onClick={() => setDraft((current) => ({ ...current, bannerIndex: index }))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setDraft((current) => ({ ...current, bannerIndex: index })); }}><img src={photo.dataUrl} alt={`Project preview ${index + 1}`} /><div><button type="button" onClick={(event) => { event.stopPropagation(); setDraft((current) => ({ ...current, bannerIndex: index })); }}>{index === draft.bannerIndex ? "Banner image" : "Use as banner"}</button><button type="button" aria-label={`Remove ${photo.name}`} onClick={(event) => { event.stopPropagation(); removePhoto(index); }}><X size={13} /></button></div></div>)}</div><div className="banner-previews"><div><p className="eyebrow">Catalog preview</p><article className="banner-preview banner-preview-catalog"><img src={(draft.photos[draft.bannerIndex] ?? draft.photos[0]).dataUrl} alt="Selected banner in project catalog" /><strong>{draft.title || "Your project title"}</strong><span>{draft.churchName || "Your church"}</span></article></div><div><p className="eyebrow">Project page preview</p><article className="banner-preview banner-preview-detail"><img src={(draft.photos[draft.bannerIndex] ?? draft.photos[0]).dataUrl} alt="Selected banner on project page" /><strong>{draft.title || "Your project title"}</strong><span>{draft.description || "Your project description will appear here."}</span></article></div></div></>}</div></section>
      <section className="church-form-section church-attestation"><div className="church-form-label"><span>04</span><div><p className="eyebrow">Before you submit</p><h2>Confirm your application.</h2><p>These confirmations help keep the review process clear and trustworthy.</p></div></div><div><label className="check-row"><input type="checkbox" checked={draft.attested} onChange={(event) => update("attested", event.target.checked)} /><span>I attest that the information in this application is accurate and that I am authorized to submit it on behalf of this organization.</span></label><label className="check-row"><input type="checkbox" checked={draft.acceptedTerms} onChange={(event) => update("acceptedTerms", event.target.checked)} /><span>I agree to the <a href="#/terms" target="_blank" rel="noreferrer" className="text-link">SoundFaith terms and conditions</a>.</span></label>{message && <p className="form-message">{message}</p>}<button className="button button-coral submit-project-button" type="submit" disabled={loading || !formReady}>{loading ? "Submitting..." : "Submit for review"} <ArrowUpRight size={16} /></button></div></section>
    </form>
  </main>;
}
