package practice;

import java.util.Set;
import java.util.UUID;

public final class PaymentService {
    private final PaymentStore store;
    private static final Set<String> CURRENCIES = Set.of("USD", "EUR", "GBP");

    public PaymentService(PaymentStore store) {
        this.store = store;
    }

    public Payment process(String cardNumber, String currency, long amount) {
        if (cardNumber == null || !cardNumber.matches("[0-9]{14,19}")
                || currency == null || !CURRENCIES.contains(currency) || amount <= 0) {
            throw new IllegalArgumentException("Invalid payment");
        }
        String masked = "*".repeat(cardNumber.length() - 4)
            + cardNumber.substring(cardNumber.length() - 4);
        Payment payment = new Payment(UUID.randomUUID().toString(), masked, currency, amount);
        store.save(payment);
        return payment;
    }
}
