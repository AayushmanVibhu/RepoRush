package practice;

import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

public final class PaymentStore {
    private final Map<String, Payment> payments = new HashMap<>();

    public void save(Payment payment) {
        payments.put(payment.id(), payment);
    }

    public Optional<Payment> find(String id) {
        return Optional.ofNullable(payments.get(id));
    }
}
