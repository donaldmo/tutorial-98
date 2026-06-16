export const serializeDocument = (doc) => {
  if (!doc) return null;

  const raw = typeof doc.toObject === 'function' ? doc.toObject() : { ...doc };
  const objectId = raw._id?.toString?.() || String(raw._id || '');

  return {
    ...raw,
    _id: objectId,
    id: objectId,
  };
};

export const serializeList = (docs = []) => docs.map(serializeDocument);
