package practice;

public final class PaymentServiceTest {
    public static void main(String[] args) {
        PaymentStore store = new PaymentStore();
        PaymentService service = new PaymentService(store);
        Payment payment = service.process("4111111111111111", "USD", 100);
        check(payment.maskedCard().equals("************1111"), "Card masking");
        check(store.find(payment.id()).orElseThrow().equals(payment), "Retrievable payment");
        check(payment.amount() == 100 && payment.currency().equals("USD"), "Minor units preserved");
        Payment second = service.process("5555555555554444", "GBP", 25);
        check(!payment.id().equals(second.id()), "Unique identifiers");
        rejects(() -> service.process("4111", "USD", 100));
        rejects(() -> service.process("411111111111111x", "USD", 100));
        rejects(() -> service.process(null, "USD", 100));
        rejects(() -> service.process("4111111111111111", "XYZ", 100));
        rejects(() -> service.process("4111111111111111", null, 100));
        rejects(() -> service.process("4111111111111111", "USD", 0));
        rejects(() -> service.process("4111111111111111", "USD", -1));
        System.out.println("Payment regression checks passed");
    }

    private static void check(boolean condition, String message) {
        if (!condition) throw new AssertionError(message);
    }

    private static void rejects(Runnable operation) {
        try {
            operation.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError("Invalid payment was accepted");
    }
}
