# Security Specification - SmartBilling Engine

## Data Invariants
1. A Customer must have a unique ID and be linked to an Owner.
2. A Transaction must reference an existing Customer and have the same Owner as that Customer.
3. Settings are private to the Owner (UID).
4. WhatsApp Messages are private to the Owner.
5. Complaints can be created by anyone (public) but are only manageable by the Owner.

## The "Dirty Dozen" Payloads (Targeting Vulnerabilities)

1. **Identity Spoofing**: Attempt to create a customer with someone else's `ownerId`.
2. **Resource Poisoning**: Create a customer with a 1MB string as the `id` or `name`.
3. **Ghost Field Injection**: Add `isVerified: true` to a Customer record during update.
4. **Relational Bypass**: Create a Transaction for a Customer that belongs to a different Owner.
5. **PII Leak**: An unauthenticated user attempting to `list` all characters in `customers` collection.
6. **Immutable field violation**: Attempting to change `createdAt` on a Customer record.
7. **Privilege Escalation**: Attempting to update `settings` of another user.
8. **Shadow Complaint**: Creating a Complaint with a fake `customerId` that doesn't exist.
9. **Query Scraping**: Authenticated user trying to `list` all WhatsApp messages without a `where` clause for `ownerId`.
10. **State Shortcut**: Updating a Complaint from 'Pending' to 'Resolved' without the proper permissions (if any specific role existed).
11. **Mass Deletion**: Attempting to delete all `customers` in one go without being the owner.
12. **Metadata Tampering**: Setting `updatedAt` to a past date instead of `request.time`.

## Test Scenarios
- **Scenario 1**: User A tries to read User B's settings -> DENIED.
- **Scenario 2**: User A tries to create a customer for User B -> DENIED.
- **Scenario 3**: Public user tries to read private customer data -> DENIED.
- **Scenario 4**: User A tries to update User A's customer record, but changes `ownerId` -> DENIED.
- **Scenario 5**: User A tries to read User A's customers -> ALLOWED.
