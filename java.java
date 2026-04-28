import javax.swing.*;
import java.awt.*;
import java.awt.event.*;

public class ElectricityComplaintForm extends JFrame implements ActionListener {

    JLabel lblTitle, lblName, lblAddress, lblIssue, lblResult;
    JTextField txtName, txtAddress;
    JComboBox<String> cmbIssue;
    JButton btnSubmit, btnClear;

    ElectricityComplaintForm() {
        setTitle("Electricity Complaint Form");
        setSize(450, 350);
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setLayout(new GridLayout(6, 2, 10, 10));

        lblTitle = new JLabel("Electricity Complaint Form", JLabel.CENTER);
        lblName = new JLabel("Consumer Name:");
        lblAddress = new JLabel("Address:");
        lblIssue = new JLabel("Issue Type:");
        lblResult = new JLabel("");

        txtName = new JTextField();
        txtAddress = new JTextField();

        String issues[] = {"Power Cut", "Meter Problem", "Low Voltage", "Wire Damage", "Billing Issue"};
        cmbIssue = new JComboBox<>(issues);

        btnSubmit = new JButton("Submit");
        btnClear = new JButton("Clear");

        btnSubmit.addActionListener(this);
        btnClear.addActionListener(this);

        add(lblTitle);
        add(new JLabel(""));

        add(lblName);
        add(txtName);

        add(lblAddress);
        add(txtAddress);

        add(lblIssue);
        add(cmbIssue);

        add(btnSubmit);
        add(btnClear);

        add(lblResult);
        add(new JLabel(""));

        setVisible(true);
    }

    public void actionPerformed(ActionEvent e) {
        if (e.getSource() == btnSubmit) {
            String name = txtName.getText();
            String address = txtAddress.getText();
            String issue = (String) cmbIssue.getSelectedItem();

            JOptionPane.showMessageDialog(this,
                    "Complaint Registered!\nName: " + name +
                    "\nAddress: " + address +
                    "\nIssue: " + issue);

            lblResult.setText("Complaint Submitted Successfully");
        }

        if (e.getSource() == btnClear) {
            txtName.setText("");
            txtAddress.setText("");
            cmbIssue.setSelectedIndex(0);
            lblResult.setText("");
        }
    }

    public static void main(String[] args) {
        new ElectricityComplaintForm();
    }
}