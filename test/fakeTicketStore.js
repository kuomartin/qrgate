export function createFakeTicketStore(initialRecords = []) {
  const records = new Map(
    initialRecords.map((record) => [record.serial, { checkedInBy: null, ...record }]),
  );

  return {
    findBySerial(serial) {
      const record = records.get(serial);
      return record ? { ...record } : null;
    },
    markCheckedIn(serial, gateId) {
      const record = records.get(serial);
      if (!record || record.status === 'checked-in') return false;
      record.status = 'checked-in';
      record.checkedInBy = gateId;
      return true;
    },
  };
}
