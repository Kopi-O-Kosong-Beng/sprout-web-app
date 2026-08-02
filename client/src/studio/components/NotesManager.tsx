import React, { useState, useEffect } from 'react';
import { 
  db, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot,
  type User,
} from '../lib/firebase';
import type { UserNote } from '../types';
import {
  Check,
  Clock,
  Database,
  Edit3,
  FileText,
  Pin,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { Badge, Button, Empty, Panel, Spinner, cx, type Tone } from './ui';

interface NotesManagerProps {
  user: User;
  onCountChange?: (count: number) => void;
}

type CategoryType = 'General' | 'Work' | 'Personal' | 'Ideas' | 'Urgent';

const CATEGORIES: CategoryType[] = ['General', 'Work', 'Personal', 'Ideas', 'Urgent'];

/** Categories map onto Spica72 semantic tones. */
const CATEGORY_TONE: Record<CategoryType, Tone> = {
  General: 'neutral',
  Work: 'info',
  Personal: 'gate',
  Ideas: 'gold',
  Urgent: 'danger',
};

export const NotesManager: React.FC<NotesManagerProps> = ({ user, onCountChange }) => {
  const [notes, setNotes] = useState<UserNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter & Search states
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Form states
  const [isCreating, setIsCreating] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<CategoryType>('General');
  const [isPinned, setIsPinned] = useState(false);
  const [saving, setSaving] = useState(false);

  // Listen to Firestore real-time snapshot for this user's notes
  useEffect(() => {
    if (!user) return;
    setLoading(true);
    setError(null);

    const notesRef = collection(db, 'user_notes');
    const q = query(notesRef, where('userId', '==', user.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetchedNotes: UserNote[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          fetchedNotes.push({
            id: docSnap.id,
            userId: data.userId,
            title: data.title || '',
            content: data.content || '',
            category: data.category || 'General',
            isPinned: !!data.isPinned,
            createdAt: data.createdAt || new Date().toISOString(),
            updatedAt: data.updatedAt || new Date().toISOString(),
          });
        });

        // Sort: Pinned first, then by updatedAt descending
        fetchedNotes.sort((a, b) => {
          if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
          return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        });

        setNotes(fetchedNotes);
        setLoading(false);
        if (onCountChange) onCountChange(fetchedNotes.length);
      },
      (err) => {
        console.error("Firestore onSnapshot error:", err);
        setError("Failed to load notes from Firestore: " + err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user]);

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    setSaving(true);
    const now = new Date().toISOString();

    try {
      if (editingNoteId) {
        // Update existing doc
        const noteRef = doc(db, 'user_notes', editingNoteId);
        await updateDoc(noteRef, {
          title: title.trim(),
          content: content.trim(),
          category,
          isPinned,
          updatedAt: now,
        });
      } else {
        // Add new doc
        await addDoc(collection(db, 'user_notes'), {
          userId: user.uid,
          title: title.trim(),
          content: content.trim(),
          category,
          isPinned,
          createdAt: now,
          updatedAt: now,
        });
      }

      resetForm();
    } catch (err: any) {
      console.error("Save note failed:", err);
      setError("Failed to save document to Firestore: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async (note: UserNote) => {
    try {
      const noteRef = doc(db, 'user_notes', note.id);
      await updateDoc(noteRef, {
        isPinned: !note.isPinned,
        updatedAt: new Date().toISOString(),
      });
    } catch (err: any) {
      console.error("Toggle pin failed:", err);
    }
  };

  const handleDeleteNote = async (id: string) => {
    if (!confirm("Are you sure you want to delete this document from Firestore?")) return;
    try {
      await deleteDoc(doc(db, 'user_notes', id));
    } catch (err: any) {
      console.error("Delete note failed:", err);
      setError("Failed to delete document: " + err.message);
    }
  };

  const startEdit = (note: UserNote) => {
    setEditingNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setCategory(note.category);
    setIsPinned(note.isPinned);
    setIsCreating(true);
  };

  const resetForm = () => {
    setTitle('');
    setContent('');
    setCategory('General');
    setIsPinned(false);
    setEditingNoteId(null);
    setIsCreating(false);
  };

  // Filter notes
  const filteredNotes = notes.filter((n) => {
    const matchesCategory = selectedCategory === 'All' || n.category === selectedCategory;
    const matchesQuery =
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesQuery;
  });

  return (
    <div id="notes-manager-section" className="space-y-4">
      {/* Top Action Bar */}
      <div
        id="notes-action-bar"
        className="flex flex-col items-stretch justify-between gap-3 rounded-pane border border-line bg-panel p-3 lg:flex-row lg:items-center"
      >
        
        {/* Search */}
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-txt-5" />
          <input
            id="search-input"
            type="text"
            placeholder="Search documents…"
            aria-label="Search documents"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-card border border-line bg-void py-2 pr-8 pl-9 text-meta text-txt placeholder:text-txt-5 focus:border-brand/50 focus:outline-none"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-2.5 -translate-y-1/2 text-txt-5 hover:text-txt-2"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-1 overflow-x-auto">
          {(['All', ...CATEGORIES] as const).map((cat) => {
            const count =
              cat === 'All' ? notes.length : notes.filter((n) => n.category === cat).length;
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cx(
                  'flex items-center gap-1.5 rounded-card border px-2.5 py-1.5 text-label font-semibold whitespace-nowrap transition-colors',
                  active
                    ? 'border-brand/40 bg-brand/10 text-brand'
                    : 'border-line bg-raised text-txt-3 hover:text-txt',
                )}
              >
                {cat}
                <span className={cx('font-mono', active ? 'text-brand/70' : 'text-txt-5')}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {!isCreating && (
          <Button
            variant="primary"
            onClick={() => setIsCreating(true)}
            icon={<Plus className="h-4 w-4" />}
            className="shrink-0"
          >
            New document
          </Button>
        )}
      </div>

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-card border border-danger/30 bg-danger/10 p-3 text-meta text-danger">
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss error">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Inline editor */}
      {isCreating && (
        <Panel className="border-brand/30">
          <form id="note-form" onSubmit={handleSaveNote}>
            <div className="flex items-center justify-between border-b border-line-soft px-4 py-3">
              <h3 className="flex items-center gap-2 text-body font-semibold text-txt">
                <FileText className="h-4 w-4 text-brand" />
                {editingNoteId ? 'Edit document' : 'New document'}
              </h3>
              <button
                type="button"
                onClick={resetForm}
                aria-label="Close editor"
                className="rounded-card p-1.5 text-txt-4 hover:bg-raised hover:text-txt"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div className="sm:col-span-2">
                  <label htmlFor="note-title" className="pixel-label mb-2 block text-txt-4">
                    Title *
                  </label>
                  <input
                    id="note-title"
                    type="text"
                    required
                    placeholder="e.g. Q3 roadmap notes"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-card border border-line bg-void px-3 py-2 text-meta text-txt placeholder:text-txt-5 focus:border-brand/50 focus:outline-none"
                  />
                </div>

                <div>
                  <label htmlFor="note-category" className="pixel-label mb-2 block text-txt-4">
                    Category
                  </label>
                  <select
                    id="note-category"
                    value={category}
                    onChange={(e) => setCategory(e.target.value as CategoryType)}
                    className="w-full rounded-card border border-line bg-void px-3 py-2 text-meta text-txt focus:border-brand/50 focus:outline-none"
                  >
                    {CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="note-content" className="pixel-label mb-2 block text-txt-4">
                  Content
                </label>
                <textarea
                  id="note-content"
                  rows={5}
                  placeholder="Changes sync to Cloud Firestore on save."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full resize-y rounded-card border border-line bg-void p-3 text-meta leading-relaxed text-txt placeholder:text-txt-5 focus:border-brand/50 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-meta text-txt-2">
                  <input
                    type="checkbox"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                    className="h-3.5 w-3.5 rounded-sm border-line bg-void accent-brand"
                  />
                  Pin to top
                </label>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={resetForm}>
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    disabled={saving || !title.trim()}
                    icon={
                      saving ? (
                        <Spinner className="h-3.5 w-3.5 border-base/30 border-t-base" />
                      ) : (
                        <Check className="h-3.5 w-3.5" />
                      )
                    }
                  >
                    {saving ? 'Writing…' : editingNoteId ? 'Update' : 'Save'}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </Panel>
      )}

      {/* Document grid */}
      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Spinner className="h-7 w-7" />
          <p className="text-meta text-txt-4">Synchronising with Cloud Firestore…</p>
        </div>
      ) : filteredNotes.length === 0 ? (
        <Empty
          icon={<Database className="h-10 w-10" />}
          title={
            searchQuery || selectedCategory !== 'All'
              ? 'No documents match this filter'
              : 'No documents yet'
          }
          sub={
            searchQuery || selectedCategory !== 'All'
              ? 'Try clearing the search term or picking a different category.'
              : 'Your Firestore collection is empty. Create the first record to get started.'
          }
          action={
            !isCreating && (
              <Button onClick={() => setIsCreating(true)} icon={<Plus className="h-3.5 w-3.5" />}>
                Add document
              </Button>
            )
          }
        />
      ) : (
        <div id="notes-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredNotes.map((note) => (
            <Panel
              key={note.id}
              className={cx(
                'group flex flex-col transition-colors',
                note.isPinned ? 'border-brand/35' : 'hover:border-line-strong',
              )}
            >
              <div className="flex items-start justify-between gap-2 p-4 pb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge tone={CATEGORY_TONE[note.category]}>{note.category}</Badge>
                  {note.isPinned && (
                    <Badge tone="brand">
                      <Pin className="h-2.5 w-2.5 fill-current" />
                      Pinned
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-0.5 opacity-70 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={() => handleTogglePin(note)}
                    title={note.isPinned ? 'Unpin' : 'Pin to top'}
                    aria-label={note.isPinned ? 'Unpin document' : 'Pin document'}
                    className={cx(
                      'rounded-card p-1.5 transition-colors hover:bg-raised',
                      note.isPinned ? 'text-brand' : 'text-txt-5 hover:text-txt-2',
                    )}
                  >
                    <Pin className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => startEdit(note)}
                    title="Edit"
                    aria-label="Edit document"
                    className="rounded-card p-1.5 text-txt-5 transition-colors hover:bg-raised hover:text-txt-2"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    title="Delete"
                    aria-label="Delete document"
                    className="rounded-card p-1.5 text-txt-5 transition-colors hover:bg-raised hover:text-danger"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 px-4 pb-4">
                <h4 className="line-clamp-2 text-body font-semibold text-txt">{note.title}</h4>
                <p className="mt-1.5 line-clamp-5 text-meta leading-relaxed whitespace-pre-wrap text-txt-3">
                  {note.content || <em className="text-txt-5">No content.</em>}
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-line-soft px-4 py-2.5 font-mono text-[10px] text-txt-5">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {new Date(note.updatedAt).toLocaleDateString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                <span>{note.id.substring(0, 6)}</span>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
};
