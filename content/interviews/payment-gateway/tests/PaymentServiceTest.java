package practice;

public final class PaymentServiceTest {

    private static int failed = 0;

    private static String quote(String value) {
        return "\"" + value.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "\\r").replace("\t", "\\t") + "\"";
    }

    private static void run(String name, Runnable test) {
        boolean pass = true;
        String diagnostic = "";
        try { test.run(); }
        catch (Throwable error) {
            pass = false;
            failed++;
            java.io.StringWriter trace = new java.io.StringWriter();
            error.printStackTrace(new java.io.PrintWriter(trace));
            diagnostic = trace.toString();
        }
        System.out.println("REP0_TEST {\"name\":" + quote(name) + ",\"pass\":" + pass + ",\"diagnostic\":" + quote(diagnostic) + "}");
    }

    public static void main(String[] args) {
        PaymentStore store = new PaymentStore();
        PaymentService service = new PaymentService(store);
        run("Masks all but the last four card digits", () -> {
            Payment payment = service.process("4111111111111111", "USD", 100);
            equal("************1111", payment.maskedCard());
        });
        run("Retrieves the saved payment by its identifier", () -> {
            Payment payment = service.process("4111111111111111", "USD", 100);
            equal(payment, store.find(payment.id()).orElseThrow());
        });
        run("Preserves minor units and currency", () -> {
            Payment payment = service.process("4111111111111111", "USD", 100);
            equal(100L, payment.amount());
            equal("USD", payment.currency());
        });
        run("Assigns a unique identifier to each payment", () -> {
            Payment first = service.process("4111111111111111", "USD", 100);
            Payment second = service.process("5555555555554444", "GBP", 25);
            equal(false, first.id().equals(second.id()));
        });
        run("Rejects a short card number", () -> rejects(() -> service.process("4111", "USD", 100)));
        run("Rejects non-digit card characters", () -> rejects(() -> service.process("411111111111111x", "USD", 100)));
        run("Rejects a missing card number", () -> rejects(() -> service.process(null, "USD", 100)));
        run("Rejects an unsupported currency", () -> rejects(() -> service.process("4111111111111111", "XYZ", 100)));
        run("Rejects a missing currency", () -> rejects(() -> service.process("4111111111111111", null, 100)));
        run("Rejects a zero amount", () -> rejects(() -> service.process("4111111111111111", "USD", 0)));
        run("Rejects a negative amount", () -> rejects(() -> service.process("4111111111111111", "USD", -1)));
        if (failed > 0) System.exit(1);
    }

    private static void equal(Object expected, Object actual) {
        if (!expected.equals(actual)) throw new AssertionError("Expected: " + expected + "\nActual: " + actual);
    }

    private static void rejects(Runnable operation) {
        try {
            operation.run();
        } catch (IllegalArgumentException expected) {
            return;
        }
        throw new AssertionError("Expected: IllegalArgumentException\nActual: invalid payment accepted");
    }
}
