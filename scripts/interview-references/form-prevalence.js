function formPrevalence(people) {
  const counts = new Map();
  for (const person of people) {
    for (const eid of person.formsToFill) {
      counts.set(eid, (counts.get(eid) ?? 0) + 1);
    }
  }
  return Object.fromEntries(
    [...counts].sort(
      ([eidA, countA], [eidB, countB]) =>
        countB - countA || eidA.localeCompare(eidB),
    ),
  );
}

module.exports = { formPrevalence };
