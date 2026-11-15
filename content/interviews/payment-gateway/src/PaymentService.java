package practice;

import java.util.Set;
import java.util.UUID;

/** RepoRush-authored practice implementation; see ATTRIBUTION.md. */
public final class PaymentService {
    private final PaymentStore store;
    private static final Set<String> CURRENCIES = Set.of("USD", "EUR", "GBP");

    public PaymentService(PaymentStore store) {
        this.store = store;
    }

    public Payment process(String cardNumber, String currency, long amount) {
        // Implement validation before storing a payment. Store only a masked card.
        throw new UnsupportedOperationException("Implement payment processing");
    }
}
